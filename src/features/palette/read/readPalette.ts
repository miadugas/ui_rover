/**
 * Read orchestrator (plan §5, tuned by docs/6-memo/ocr-spike.md).
 *
 * OCR → swatch blobs → quantize, in that order: printed codes are exact, blobs
 * are the guess that still respects the card's shapes, and quantize is never
 * wrong about *something* being there, so the UI always ends up with a palette.
 *
 * The spike changed one thing structurally: OCR only works on the card. The
 * full screenshot at 2000 px read 0/5 codes and invented 6 false positives, so
 * when Mia has not drawn a crop the orchestrator derives one from the non-edge
 * region that holds the most swatch chips (see `autoCropFrom`), and skips OCR
 * entirely when no such region exists rather than feeding Tesseract the
 * browser chrome.
 */
import type { NormalizedRect, PaletteSource, RoleMap } from '../../../types'
import { downsample } from '../downsample'
import { extract } from '../extract'
import { assignRoles, degradedFor } from '../roles'
import { mapBlobsIntoPass, passPixelHeight } from './blobSpace'
import { clampRect } from './cropRect'
import { cropToBlob, downscaleForOcr } from './cropToBlob'
import type { HexCandidate } from './hexTokens'
import { OCR_CROP_WIDTH, OCR_PASSES, OCR_PASS_TARGET_CODES } from './ocrConfig'
import type { OcrPass } from './ocrConfig'
import { ocrHexCodes } from './ocrHexCodes'
import { OcrUnavailableError, throwIfCancelled } from './readProgress'
import type { ReadProgressListener } from './readProgress'
import { detectSwatchBlobs } from './swatchBlobs'
import type { BlobCandidate } from './swatchBlobs'

export interface ReadCandidate {
  hex: string
  source: PaletteSource
  confidence?: number
  repaired?: boolean
  area?: number
}

export interface ReadResult {
  colors: string[]
  roleMap: RoleMap
  degraded: boolean
  source: PaletteSource
  candidates: ReadCandidate[]
  ocrUnavailable?: boolean
  /** The rect the orchestrator derived itself, so the UI can show or store it. */
  autoCrop?: NormalizedRect
}

export interface ReadPaletteOptions {
  sourceImageId: string
  crop?: { imageId: string } & NormalizedRect
  onProgress?: ReadProgressListener
  signal?: AbortSignal
}

const BLOB_MAX_EDGE = 240
/** A Mia-drawn crop *is* the base image, so the OCR rect fills it. */
const WHOLE_BASE: NormalizedRect = { x: 0, y: 0, w: 1, h: 1 }
const MINIMUM_COLORS = 3
const MAX_CANDIDATES = 12
const AUTO_CROP_MIN_AREA_FRACTION = 0.015
/**
 * Zero on purpose. Padding the auto-crop by 2 % dropped the browser run to 0/5
 * at every upscale width tried (1200/1500/1900) — the extra page fill pulls
 * Tesseract's layout analysis off the card — so the crop stays tight to the
 * blob bbox. Kept as a named constant because "no padding" is a measurement,
 * not an oversight.
 */
const AUTO_CROP_PADDING = 0
/**
 * A second blob pass tuned to see the swatch chips themselves, not the card:
 * on the real fixture each chip is ~0.1 % of the buffer, so the normal pass's
 * 0.4 % floor hides every one of them. `backgroundAreaFraction: 1` disables the
 * background rejection because here the page fill is a useful negative signal,
 * not noise to drop.
 */
const SMALL_BLOB_OPTIONS = {
  minAreaFraction: 0.0005,
  maxBlobs: 40,
  backgroundAreaFraction: 1,
} as const

export async function readPalette(
  blob: Blob,
  { sourceImageId, crop, onProgress, signal }: ReadPaletteOptions,
): Promise<ReadResult> {
  throwIfCancelled(signal)

  const usableCrop = crop?.imageId === sourceImageId ? crop : undefined
  const base = usableCrop
    ? await cropToBlob(blob, usableCrop)
    : await downscaleForOcr(blob)

  throwIfCancelled(signal)
  onProgress?.({ phase: 'detecting' })

  const { data, width, height } = await downsample(base, BLOB_MAX_EDGE)
  const blobs = detectSwatchBlobs(data, width, height)
  const autoCrop = usableCrop
    ? undefined
    : autoCropFrom(data, width, height, blobs)

  throwIfCancelled(signal)

  let hexCodes: HexCandidate[] = []
  let ocrUnavailable = false
  const ocrRect = usableCrop ?? autoCrop

  if (ocrRect) {
    try {
      hexCodes = await readHexCodes(blob, ocrRect, {
        firstPassInput: usableCrop ? base : undefined,
        detector: {
          blobs,
          width,
          height,
          ocrRect: usableCrop ? WHOLE_BASE : ocrRect,
        },
        onProgress,
        signal,
      })
    } catch (error) {
      if (!(error instanceof OcrUnavailableError)) throw error
      ocrUnavailable = true
    }
  }

  throwIfCancelled(signal)

  const candidates = [...ocrCandidates(hexCodes), ...blobCandidates(blobs)]

  if (hexCodes.length >= MINIMUM_COLORS) {
    return paletteFrom(orderedOcrColors(hexCodes), 'ocr', {
      candidates,
      ocrUnavailable,
      autoCrop,
    })
  }

  if (blobs.length >= MINIMUM_COLORS) {
    return paletteFrom(
      blobs.map((candidate) => candidate.hex),
      'blobs',
      { candidates, ocrUnavailable, autoCrop },
    )
  }

  const quantized = await extract(base)
  onProgress?.({ phase: 'done' })

  return {
    colors: quantized.colors,
    roleMap: quantized.roleMap,
    degraded: quantized.degraded,
    source: 'quantize',
    candidates: [
      ...candidates,
      ...quantized.colors.map((hex) => ({ hex, source: 'quantize' as const })),
    ],
    ocrUnavailable,
    autoCrop,
  }
}

/** Where the blobs were measured, and where the OCR rect sits in that picture. */
interface DetectorSpace {
  blobs: BlobCandidate[]
  width: number
  height: number
  ocrRect: NormalizedRect
}

interface ReadHexCodesOptions {
  firstPassInput?: Blob
  detector: DetectorSpace
  onProgress?: ReadProgressListener
  signal?: AbortSignal
}

/**
 * Runs `OCR_PASSES` over sub-rects of the same OCR rect and unions what they
 * read.
 *
 * The browser run killed the old "same rect, wider upscale" second pass: 1900 px
 * never recovered a code that 1200 px missed. What does help is looking at a
 * different *part* of the card — the right 45 % column reads 4/5 where the whole
 * card reads 2/5 — so the passes differ by geometry first and width second.
 * Passes are ordered cheapest-useful first and stop as soon as the union holds
 * `OCR_PASS_TARGET_CODES` exact codes, so a clean card still pays for one pass.
 */
async function readHexCodes(
  blob: Blob,
  rect: NormalizedRect,
  { firstPassInput, detector, onProgress, signal }: ReadHexCodesOptions,
): Promise<HexCandidate[]> {
  let union: HexCandidate[] = []

  for (const [index, pass] of OCR_PASSES.entries()) {
    throwIfCancelled(signal)

    const input = await passInput(blob, rect, pass, firstPassInput)
    const found = await ocrHexCodes(input, {
      blobs: blobsForPass(detector, pass),
      onProgress: spanProgress(onProgress, index, OCR_PASSES.length),
      signal,
    })

    union = unionByHex(union, found)
    if (exactCount(union) >= OCR_PASS_TARGET_CODES) break
  }

  return union
}

/**
 * The pass's blobs, in the pass's own pixels. `pass.targetWidth` is also the
 * rendered width: `cropToBlob` is called with `minWidth` equal to it, and the
 * whole-rect reuse of a Mia-drawn crop only applies at `OCR_CROP_WIDTH`.
 */
function blobsForPass(detector: DetectorSpace, pass: OcrPass): BlobCandidate[] {
  const rect = passRect(detector.ocrRect, pass)
  const passWidth = pass.targetWidth

  return mapBlobsIntoPass(detector.blobs, {
    detectorWidth: detector.width,
    detectorHeight: detector.height,
    rect,
    passWidth,
    passHeight: passPixelHeight(
      rect,
      detector.width,
      detector.height,
      passWidth,
    ),
  })
}

/**
 * The pass's slice of the OCR rect: a horizontal band of the full height, since
 * the hex codes run down a column and every row needs its own label for context.
 */
function passRect(rect: NormalizedRect, pass: OcrPass): NormalizedRect {
  return clampRect({
    x: rect.x + rect.w * pass.xFrac,
    y: rect.y,
    w: rect.w * pass.wFrac,
    h: rect.h,
  })
}

/**
 * `minWidth` is passed alongside `targetWidth` because `cropToBlob` floors the
 * output at `OCR_CROP_WIDTH` by default, which would silently drag the
 * right-column pass back up from its measured 1000 px to 1200 px.
 */
async function passInput(
  blob: Blob,
  rect: NormalizedRect,
  pass: OcrPass,
  firstPassInput?: Blob,
): Promise<Blob> {
  if (firstPassInput && coversWholeRect(pass)) return firstPassInput

  return await cropToBlob(blob, passRect(rect, pass), {
    targetWidth: pass.targetWidth,
    minWidth: pass.targetWidth,
  })
}

/** True when a Mia-drawn crop, already rendered once, is this pass's input. */
function coversWholeRect(pass: OcrPass): boolean {
  return (
    pass.xFrac === 0 && pass.wFrac === 1 && pass.targetWidth === OCR_CROP_WIDTH
  )
}

/** Repairs are guesses, so they never satisfy the early stop. */
function exactCount(candidates: HexCandidate[]): number {
  return candidates.filter((candidate) => !candidate.repaired).length
}

/** Keeps `recognizing` a single 0→1 sweep across however many passes run. */
function spanProgress(
  onProgress: ReadProgressListener | undefined,
  index: number,
  total: number,
): ReadProgressListener | undefined {
  if (!onProgress) return undefined

  return (progress) => {
    if (progress.phase !== 'recognizing' || progress.fraction === undefined) {
      onProgress(progress)
      return
    }

    onProgress({
      phase: progress.phase,
      fraction: (index + progress.fraction) / total,
    })
  }
}

/** Union by hex, keeping the more confident read and the earlier position. */
function unionByHex(
  first: HexCandidate[],
  second: HexCandidate[],
): HexCandidate[] {
  const byHex = new Map<string, HexCandidate>()

  for (const candidate of [...first, ...second]) {
    const existing = byHex.get(candidate.hex)
    if (existing && existing.confidence >= candidate.confidence) continue

    byHex.set(candidate.hex, candidate)
  }

  return [...byHex.values()].slice(0, MAX_CANDIDATES)
}

/**
 * The card body: a region clear of every image edge that *contains swatches*.
 *
 * Size alone picked the wrong thing. On the real fixture the palette card is
 * only 3.3 % of the buffer and the dark panel beside it is 3.1 %, so the old
 * 5 % floor matched nothing at all and OCR never ran. Dropping the floor to
 * 1.5 % lets both in, and the tie is then broken by what a palette card
 * actually is: the rectangle with swatch chips nested inside it. A second,
 * low-threshold blob pass finds those chips, and each candidate scores the
 * number of them that fall within its bbox — containment is inclusive of the
 * candidate's own edges because chips routinely sit flush against the card.
 *
 * With no chips anywhere we are back to a size guess, so the largest non-edge
 * candidate wins, which is the old behaviour minus the floor.
 *
 * Returned unpadded: see `AUTO_CROP_PADDING`. The rows' surrounding context is
 * recovered by the pass geometry instead — the right-column pass keeps part of
 * each label beside the hex code rather than growing the crop outwards.
 */
function autoCropFrom(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  blobs: BlobCandidate[],
): NormalizedRect | undefined {
  if (width <= 0 || height <= 0) return undefined

  const minimumArea = width * height * AUTO_CROP_MIN_AREA_FRACTION
  const candidates = blobs
    .filter(
      ({ area, bbox }) =>
        area >= minimumArea && !touchesEdge(bbox, width, height),
    )
    .sort((first, second) => second.area - first.area)
  if (candidates.length === 0) return undefined

  const smallBlobs = detectSwatchBlobs(data, width, height, SMALL_BLOB_OPTIONS)
  // Already area-descending, and `>` keeps the incumbent, so a score tie —
  // including the all-zero no-chips case — resolves to the largest candidate.
  const card = candidates
    .map((candidate) => ({
      candidate,
      score: containedCount(candidate.bbox, smallBlobs),
    }))
    .reduce((winner, entry) => (entry.score > winner.score ? entry : winner))
    .candidate

  return clampRect({
    x: card.bbox.x0 / width - AUTO_CROP_PADDING,
    y: card.bbox.y0 / height - AUTO_CROP_PADDING,
    w: (card.bbox.x1 - card.bbox.x0) / width + AUTO_CROP_PADDING * 2,
    h: (card.bbox.y1 - card.bbox.y0) / height + AUTO_CROP_PADDING * 2,
  })
}

function containedCount(
  outer: BlobCandidate['bbox'],
  smallBlobs: BlobCandidate[],
): number {
  return smallBlobs.filter(({ bbox }) => contains(outer, bbox)).length
}

/** Inclusive of shared edges, but a bbox never contains a copy of itself. */
function contains(
  outer: BlobCandidate['bbox'],
  inner: BlobCandidate['bbox'],
): boolean {
  if (
    outer.x0 === inner.x0 &&
    outer.y0 === inner.y0 &&
    outer.x1 === inner.x1 &&
    outer.y1 === inner.y1
  ) {
    return false
  }

  return (
    inner.x0 >= outer.x0 &&
    inner.y0 >= outer.y0 &&
    inner.x1 <= outer.x1 &&
    inner.y1 <= outer.y1
  )
}

function touchesEdge(
  bbox: BlobCandidate['bbox'],
  width: number,
  height: number,
): boolean {
  return bbox.x0 <= 0 || bbox.y0 <= 0 || bbox.x1 >= width || bbox.y1 >= height
}

interface PaletteExtras {
  candidates: ReadCandidate[]
  ocrUnavailable: boolean
  autoCrop?: NormalizedRect
}

function paletteFrom(
  colors: string[],
  source: PaletteSource,
  { candidates, ocrUnavailable, autoCrop }: PaletteExtras,
): ReadResult {
  return {
    colors,
    roleMap: assignRoles(colors),
    degraded: degradedFor(colors),
    source,
    candidates,
    ocrUnavailable,
    autoCrop,
  }
}

/** Unrepaired codes first: the preview checks them, repairs trail unchecked. */
function orderedOcrColors(hexCodes: HexCandidate[]): string[] {
  return [
    ...hexCodes.filter((candidate) => !candidate.repaired),
    ...hexCodes.filter((candidate) => candidate.repaired),
  ].map((candidate) => candidate.hex)
}

function ocrCandidates(hexCodes: HexCandidate[]): ReadCandidate[] {
  return hexCodes.map(({ hex, confidence, repaired }) => ({
    hex,
    source: 'ocr' as const,
    confidence,
    repaired,
  }))
}

function blobCandidates(blobs: BlobCandidate[]): ReadCandidate[] {
  return blobs.map(({ hex, area }) => ({ hex, source: 'blobs' as const, area }))
}
