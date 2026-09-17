import { DEDUPE_THRESHOLD, toHex } from '../quantize'
import type { Rgb } from '../quantize'

export interface BlobCandidate {
  hex: string
  area: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface DetectSwatchBlobOptions {
  minAreaFraction?: number
  maxBlobs?: number
  backgroundAreaFraction?: number
}

interface ComponentCandidate {
  color: Rgb
  area: number
  bbox: BlobCandidate['bbox']
}

function pixelBin(pixels: Uint8ClampedArray, pixelIndex: number): number {
  const offset = pixelIndex * 4
  return (
    ((pixels[offset] >> 4) << 8) |
    ((pixels[offset + 1] >> 4) << 4) |
    (pixels[offset + 2] >> 4)
  )
}

function findRoot(parents: Uint32Array, label: number): number {
  let root = label

  while (parents[root] !== root) root = parents[root]
  while (parents[label] !== label) {
    const next = parents[label]
    parents[label] = root
    label = next
  }

  return root
}

function unionLabels(
  parents: Uint32Array,
  first: number,
  second: number,
): number {
  const firstRoot = findRoot(parents, first)
  const secondRoot = findRoot(parents, second)
  if (firstRoot === secondRoot) return firstRoot

  const root = Math.min(firstRoot, secondRoot)
  parents[Math.max(firstRoot, secondRoot)] = root
  return root
}

function colorDistance(first: Rgb, second: Rgb): number {
  return Math.hypot(
    first.r - second.r,
    first.g - second.g,
    first.b - second.b,
  )
}

export function detectSwatchBlobs(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  {
    minAreaFraction = 0.004,
    maxBlobs = 8,
    backgroundAreaFraction = 0.15,
  }: DetectSwatchBlobOptions = {},
): BlobCandidate[] {
  const pixelCount = width * height
  const blobLimit = Math.max(0, Math.floor(maxBlobs))
  if (
    width <= 0 ||
    height <= 0 ||
    pixels.length < pixelCount * 4 ||
    blobLimit === 0
  ) {
    return []
  }

  const bins = new Uint16Array(pixelCount)
  const labels = new Uint32Array(pixelCount)
  const parents = new Uint32Array(pixelCount + 1)
  let nextLabel = 1

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    bins[pixelIndex] = pixelBin(pixels, pixelIndex)
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x
      const bin = bins[pixelIndex]
      const leftLabel =
        x > 0 && bins[pixelIndex - 1] === bin ? labels[pixelIndex - 1] : 0
      const topLabel =
        y > 0 && bins[pixelIndex - width] === bin
          ? labels[pixelIndex - width]
          : 0

      if (leftLabel === 0 && topLabel === 0) {
        labels[pixelIndex] = nextLabel
        parents[nextLabel] = nextLabel
        nextLabel += 1
        continue
      }

      if (leftLabel === 0 || topLabel === 0) {
        labels[pixelIndex] = leftLabel || topLabel
        continue
      }

      labels[pixelIndex] = unionLabels(parents, leftLabel, topLabel)
    }
  }

  const areas = new Uint32Array(nextLabel)
  const minimumX = new Int32Array(nextLabel)
  const minimumY = new Int32Array(nextLabel)
  const maximumX = new Int32Array(nextLabel)
  const maximumY = new Int32Array(nextLabel)
  const redTotals = new Float64Array(nextLabel)
  const greenTotals = new Float64Array(nextLabel)
  const blueTotals = new Float64Array(nextLabel)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x
      const root = findRoot(parents, labels[pixelIndex])
      const offset = pixelIndex * 4
      labels[pixelIndex] = root

      if (areas[root] === 0) {
        minimumX[root] = x
        minimumY[root] = y
        maximumX[root] = x + 1
        maximumY[root] = y + 1
      } else {
        minimumX[root] = Math.min(minimumX[root], x)
        minimumY[root] = Math.min(minimumY[root], y)
        maximumX[root] = Math.max(maximumX[root], x + 1)
        maximumY[root] = Math.max(maximumY[root], y + 1)
      }

      areas[root] += 1
      redTotals[root] += pixels[offset]
      greenTotals[root] += pixels[offset + 1]
      blueTotals[root] += pixels[offset + 2]
    }
  }

  const minimumArea = pixelCount * minAreaFraction
  const candidates: ComponentCandidate[] = []

  for (let label = 1; label < nextLabel; label += 1) {
    const area = areas[label]
    if (area < minimumArea) continue

    const bbox = {
      x0: minimumX[label],
      y0: minimumY[label],
      x1: maximumX[label],
      y1: maximumY[label],
    }
    const componentWidth = bbox.x1 - bbox.x0
    const componentHeight = bbox.y1 - bbox.y0
    const aspect = componentWidth / componentHeight
    if (aspect < 0.25 || aspect > 4) continue

    const touchedEdges =
      Number(bbox.x0 === 0) +
      Number(bbox.y0 === 0) +
      Number(bbox.x1 === width) +
      Number(bbox.y1 === height)
    if (
      touchedEdges >= 2 &&
      area > pixelCount * backgroundAreaFraction
    ) {
      continue
    }

    candidates.push({
      area,
      bbox,
      color: {
        r: redTotals[label] / area,
        g: greenTotals[label] / area,
        b: blueTotals[label] / area,
      },
    })
  }

  candidates.sort((first, second) => second.area - first.area)
  const kept: ComponentCandidate[] = []

  for (const candidate of candidates) {
    const isNearExisting = kept.some(
      (existing) =>
        colorDistance(candidate.color, existing.color) <= DEDUPE_THRESHOLD,
    )
    if (isNearExisting) continue

    kept.push(candidate)
    if (kept.length === blobLimit) break
  }

  return kept.map(({ color, area, bbox }) => ({
    hex: toHex(color),
    area,
    bbox,
  }))
}
