import type { BlobCandidate } from './swatchBlobs'

export interface OcrBbox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrWord {
  text: string
  confidence: number
  bbox: OcrBbox
}

export interface HexCandidate {
  hex: string
  confidence: number
  repaired: boolean
  bbox?: OcrBbox
}

interface CandidateLine {
  y: number
  height: number
  candidates: HexCandidate[]
}

const LONG_HEX_PATTERN = /^#[0-9a-f]{6}$/i
const SHORT_HEX_PATTERN = /^#[0-9a-f]{3}$/i
const BARE_HEX_PATTERN = /^[0-9a-f]{6}$/i
const MAX_CANDIDATES = 12
const REPAIR_CONFIDENCE_PENALTY = 10
/**
 * How far the next word may sit from a lone `#`, as a multiple of the taller
 * word's height. Row strips read `O Brand Blue # 2F6BFF` — Tesseract emits the
 * hash as its own word — so the join has to reach across a normal inter-word
 * space without swallowing the next column.
 */
const HASH_JOIN_GAP_RATIO = 1.5
const AMBIGUOUS_CHARACTERS: Readonly<Record<string, string>> = {
  O: '0',
  o: '0',
  I: '1',
  l: '1',
  '|': '1',
  S: '5',
  Z: '2',
  B: '8',
}

function expandShortHex(token: string): string {
  return `#${[...token.slice(1)]
    .map((character) => `${character}${character}`)
    .join('')}`.toLowerCase()
}

function bboxHeight(bbox: OcrBbox): number {
  return Math.max(0, bbox.y1 - bbox.y0)
}

function verticalGap(first: OcrBbox, second: OcrBbox): number {
  return Math.max(first.y0 - second.y1, second.y0 - first.y1, 0)
}

function bboxGap(first: OcrBbox, second: OcrBbox): number {
  return Math.max(horizontalGap(first, second), verticalGap(first, second))
}

function sharesLine(first: OcrBbox, second: OcrBbox): boolean {
  return Math.min(first.y1, second.y1) > Math.max(first.y0, second.y0)
}

function horizontalGap(first: OcrBbox, second: OcrBbox): number {
  return Math.max(first.x0 - second.x1, second.x0 - first.x1, 0)
}

function spanBbox(first: OcrBbox, second: OcrBbox): OcrBbox {
  return {
    x0: Math.min(first.x0, second.x0),
    y0: Math.min(first.y0, second.y0),
    x1: Math.max(first.x1, second.x1),
    y1: Math.max(first.y1, second.y1),
  }
}

/**
 * Rejoins a `#` Tesseract split off from its digits.
 *
 * Only an exact hex pairing is joined: `# 2F6BFF` becomes one word, `# hello`
 * stays two and reads as nothing. The joined word keeps the *digits'*
 * confidence — the bare `#` scores near-randomly — and a bbox spanning both, so
 * reading order and the near-blob test still see where the code sat on the row.
 */
function joinHashWords(words: OcrWord[]): OcrWord[] {
  const joined: OcrWord[] = []

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    const next = words[index + 1]

    if (word === undefined) continue
    if (word.text.trim() !== '#' || next === undefined) {
      joined.push(word)
      continue
    }

    const text = `#${next.text.trim()}`
    const reach =
      HASH_JOIN_GAP_RATIO *
      Math.max(bboxHeight(word.bbox), bboxHeight(next.bbox))

    if (
      !LONG_HEX_PATTERN.test(text) &&
      !SHORT_HEX_PATTERN.test(text)
    ) {
      joined.push(word)
      continue
    }

    if (
      !sharesLine(word.bbox, next.bbox) ||
      horizontalGap(word.bbox, next.bbox) > reach
    ) {
      joined.push(word)
      continue
    }

    joined.push({
      text,
      confidence: next.confidence,
      bbox: spanBbox(word.bbox, next.bbox),
    })
    index += 1
  }

  return joined
}

function isNearBlob(word: OcrWord, blobs: BlobCandidate[]): boolean {
  const lineHeight = bboxHeight(word.bbox)
  if (lineHeight === 0) return false

  return blobs.some((blob) => bboxGap(word.bbox, blob.bbox) <= lineHeight)
}

function repairToken(
  token: string,
): { hex: string; ambiguousCount: number } | null {
  if (!token.startsWith('#')) return null
  if (token.length !== 4 && token.length !== 7) return null

  let ambiguousCount = 0
  let repaired = '#'

  for (const character of token.slice(1)) {
    const replacement = AMBIGUOUS_CHARACTERS[character]
    if (replacement) {
      ambiguousCount += 1
      repaired += replacement
      continue
    }

    repaired += character
  }

  if (ambiguousCount === 0 || ambiguousCount > 2) return null
  if (LONG_HEX_PATTERN.test(repaired)) {
    return { hex: repaired.toLowerCase(), ambiguousCount }
  }
  if (SHORT_HEX_PATTERN.test(repaired)) {
    return { hex: expandShortHex(repaired), ambiguousCount }
  }

  return null
}

function candidateFromWord(
  word: OcrWord,
  blobs: BlobCandidate[],
): HexCandidate | null {
  const token = word.text.trim()

  if (LONG_HEX_PATTERN.test(token)) {
    return {
      hex: token.toLowerCase(),
      confidence: word.confidence,
      repaired: false,
      bbox: word.bbox,
    }
  }

  if (SHORT_HEX_PATTERN.test(token)) {
    return {
      hex: expandShortHex(token),
      confidence: word.confidence,
      repaired: true,
      bbox: word.bbox,
    }
  }

  if (BARE_HEX_PATTERN.test(token) && isNearBlob(word, blobs)) {
    return {
      hex: `#${token.toLowerCase()}`,
      confidence: word.confidence,
      repaired: false,
      bbox: word.bbox,
    }
  }

  const repair = repairToken(token)
  if (!repair) return null

  return {
    hex: repair.hex,
    confidence: Math.max(
      0,
      word.confidence - repair.ambiguousCount * REPAIR_CONFIDENCE_PENALTY,
    ),
    repaired: true,
    bbox: word.bbox,
  }
}

function readingOrder(candidates: HexCandidate[]): HexCandidate[] {
  const byVerticalPosition = [...candidates].sort((left, right) => {
    const leftBox = left.bbox
    const rightBox = right.bbox
    if (!leftBox || !rightBox) return 0

    return leftBox.y0 - rightBox.y0 || leftBox.x0 - rightBox.x0
  })
  const lines: CandidateLine[] = []

  for (const candidate of byVerticalPosition) {
    const bbox = candidate.bbox
    if (!bbox) continue

    const height = bboxHeight(bbox)
    const line = lines.find(
      (existing) =>
        Math.abs(bbox.y0 - existing.y) <=
        Math.min(height, existing.height) / 2,
    )

    if (line) {
      line.candidates.push(candidate)
      continue
    }

    lines.push({ y: bbox.y0, height, candidates: [candidate] })
  }

  return lines.flatMap((line) =>
    line.candidates.sort(
      (left, right) => (left.bbox?.x0 ?? 0) - (right.bbox?.x0 ?? 0),
    ),
  )
}

export function parseHexTokens(
  words: OcrWord[],
  blobs: BlobCandidate[] = [],
): HexCandidate[] {
  const candidates = joinHashWords(words)
    .map((word) => candidateFromWord(word, blobs))
    .filter((candidate): candidate is HexCandidate => candidate !== null)
  const seen = new Set<string>()
  const unique: HexCandidate[] = []

  for (const candidate of readingOrder(candidates)) {
    if (seen.has(candidate.hex)) continue

    seen.add(candidate.hex)
    unique.push(candidate)
    if (unique.length === MAX_CANDIDATES) break
  }

  return unique
}
