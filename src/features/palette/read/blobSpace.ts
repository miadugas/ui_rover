/**
 * Blob bboxes and OCR word bboxes are measured in different pictures.
 *
 * `detectSwatchBlobs` runs on the ≤240 px downsample of the base image, while
 * each OCR pass hands Tesseract its own cropped, upscaled slice — so a pass's
 * words come back in that slice's pixels. `hexTokens`' near-blob test compares
 * the two directly, so every pass maps its blobs across first or the proximity
 * check is meaningless.
 */
import type { NormalizedRect } from '../../../types'
import type { BlobCandidate } from './swatchBlobs'

export interface PassSpace {
  /** Size of the detector buffer the blob bboxes were measured in. */
  detectorWidth: number
  detectorHeight: number
  /** The pass's sub-rect, normalized over the same base image. */
  rect: NormalizedRect
  /** Pixel size the pass's input is rendered at. */
  passWidth: number
  passHeight: number
}

/** The crop keeps the sub-rect's aspect, so its height follows from its width. */
export function passPixelHeight(
  rect: NormalizedRect,
  detectorWidth: number,
  detectorHeight: number,
  passWidth: number,
): number {
  if (detectorWidth <= 0 || rect.w <= 0) return 0

  return (passWidth * rect.h * detectorHeight) / (rect.w * detectorWidth)
}

/**
 * Blobs that fall entirely outside the sub-rect are dropped rather than mapped
 * to negative coordinates: a chip on the other side of the card must not sit
 * next to a word just because both project onto the same edge.
 */
export function mapBlobsIntoPass(
  blobs: BlobCandidate[],
  {
    detectorWidth,
    detectorHeight,
    rect,
    passWidth,
    passHeight,
  }: PassSpace,
): BlobCandidate[] {
  if (detectorWidth <= 0 || detectorHeight <= 0) return []
  if (rect.w <= 0 || rect.h <= 0) return []

  const mapped: BlobCandidate[] = []

  for (const blob of blobs) {
    const left = (blob.bbox.x0 / detectorWidth - rect.x) / rect.w
    const right = (blob.bbox.x1 / detectorWidth - rect.x) / rect.w
    const top = (blob.bbox.y0 / detectorHeight - rect.y) / rect.h
    const bottom = (blob.bbox.y1 / detectorHeight - rect.y) / rect.h

    if (right <= 0 || left >= 1 || bottom <= 0 || top >= 1) continue

    mapped.push({
      ...blob,
      bbox: {
        x0: left * passWidth,
        y0: top * passHeight,
        x1: right * passWidth,
        y1: bottom * passHeight,
      },
    })
  }

  return mapped
}
