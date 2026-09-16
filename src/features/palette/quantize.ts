export interface Rgb {
  r: number
  g: number
  b: number
}

export interface QuantizeOptions {
  buckets?: number
}

interface WeightedColor {
  rgb: Rgb
  count: number
}

interface ColorBox {
  colors: WeightedColor[]
}

type Channel = keyof Rgb

export const DEDUPE_THRESHOLD = 24

function colorRange(colors: WeightedColor[], channel: Channel): number {
  let minimum = 255
  let maximum = 0

  for (const color of colors) {
    minimum = Math.min(minimum, color.rgb[channel])
    maximum = Math.max(maximum, color.rgb[channel])
  }

  return maximum - minimum
}

function widestChannel(colors: WeightedColor[]): Channel {
  const redRange = colorRange(colors, 'r')
  const greenRange = colorRange(colors, 'g')
  const blueRange = colorRange(colors, 'b')

  let channel: Channel = 'r'
  let widestRange = redRange

  if (greenRange > widestRange) {
    channel = 'g'
    widestRange = greenRange
  }

  if (blueRange > widestRange) channel = 'b'
  return channel
}

function boxPopulation(box: ColorBox): number {
  return box.colors.reduce((total, color) => total + color.count, 0)
}

function boxRange(box: ColorBox): number {
  return Math.max(
    colorRange(box.colors, 'r'),
    colorRange(box.colors, 'g'),
    colorRange(box.colors, 'b'),
  )
}

function boxToSplit(boxes: ColorBox[]): number {
  let selectedIndex = -1
  let selectedRange = -1
  let selectedPopulation = -1

  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index]
    if (box.colors.length < 2) continue

    const range = boxRange(box)
    const population = boxPopulation(box)
    if (
      range > selectedRange ||
      (range === selectedRange && population > selectedPopulation)
    ) {
      selectedIndex = index
      selectedRange = range
      selectedPopulation = population
    }
  }

  return selectedIndex
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] {
  const channel = widestChannel(box.colors)
  const colors = [...box.colors].sort(
    (left, right) =>
      left.rgb[channel] - right.rgb[channel] ||
      left.rgb.r - right.rgb.r ||
      left.rgb.g - right.rgb.g ||
      left.rgb.b - right.rgb.b,
  )
  const targetPopulation = boxPopulation(box) / 2
  let runningPopulation = 0
  let splitIndex = colors.length - 1

  for (let index = 0; index < colors.length - 1; index += 1) {
    runningPopulation += colors[index].count
    if (runningPopulation < targetPopulation) continue

    splitIndex = index + 1
    break
  }

  return [
    { colors: colors.slice(0, splitIndex) },
    { colors: colors.slice(splitIndex) },
  ]
}

function averageColor(box: ColorBox): Rgb {
  const population = boxPopulation(box)
  const totals = box.colors.reduce(
    (result, color) => ({
      r: result.r + color.rgb.r * color.count,
      g: result.g + color.rgb.g * color.count,
      b: result.b + color.rgb.b * color.count,
    }),
    { r: 0, g: 0, b: 0 },
  )

  return {
    r: Math.round(totals.r / population),
    g: Math.round(totals.g / population),
    b: Math.round(totals.b / population),
  }
}

export function quantize(
  pixels: Uint8ClampedArray,
  { buckets = 8 }: QuantizeOptions = {},
): Rgb[] {
  const histogram = new Map<number, WeightedColor>()

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue

    const rgb = {
      r: pixels[index],
      g: pixels[index + 1],
      b: pixels[index + 2],
    }
    const key = (rgb.r << 16) | (rgb.g << 8) | rgb.b
    const existing = histogram.get(key)

    if (existing) {
      existing.count += 1
      continue
    }

    histogram.set(key, { rgb, count: 1 })
  }

  if (histogram.size === 0) return []

  const targetBuckets = Math.max(1, Math.floor(buckets))
  const colors = [...histogram.values()].sort(
    (left, right) =>
      left.rgb.r - right.rgb.r ||
      left.rgb.g - right.rgb.g ||
      left.rgb.b - right.rgb.b,
  )
  const boxes: ColorBox[] = [{ colors }]

  while (boxes.length < targetBuckets) {
    const selectedIndex = boxToSplit(boxes)
    if (selectedIndex === -1) break

    const [first, second] = splitBox(boxes[selectedIndex])
    boxes.splice(selectedIndex, 1, first, second)
  }

  return boxes.map(averageColor)
}

function colorDistance(left: Rgb, right: Rgb): number {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b)
}

export function dedupe(
  colors: Rgb[],
  threshold = DEDUPE_THRESHOLD,
): Rgb[] {
  const uniqueColors: Rgb[] = []

  for (const color of colors) {
    const isNearExisting = uniqueColors.some(
      (existing) => colorDistance(color, existing) <= threshold,
    )
    if (!isNearExisting) uniqueColors.push(color)
  }

  return uniqueColors
}

function linearChannel(channel: number): number {
  const normalized = channel / 255
  if (normalized <= 0.04045) return normalized / 12.92
  return ((normalized + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(color: Rgb): number {
  return (
    linearChannel(color.r) * 0.2126 +
    linearChannel(color.g) * 0.7152 +
    linearChannel(color.b) * 0.0722
  )
}

export function sortByLuminance(colors: Rgb[]): Rgb[] {
  return [...colors].sort(
    (left, right) => relativeLuminance(right) - relativeLuminance(left),
  )
}

function normalizedChannel(channel: number): number {
  return Math.max(0, Math.min(255, Math.round(channel)))
}

export function toHex(color: Rgb): string {
  const channels = [color.r, color.g, color.b]
    .map(normalizedChannel)
    .map((channel) => channel.toString(16).padStart(2, '0'))

  return `#${channels.join('')}`
}

export function fromHex(hex: string): Rgb {
  const normalized = hex.trim().toLowerCase()
  const shortMatch = /^#([0-9a-f]{3})$/.exec(normalized)
  const longMatch = /^#([0-9a-f]{6})$/.exec(normalized)

  if (shortMatch) {
    const [r, g, b] = [...shortMatch[1]].map((channel) =>
      Number.parseInt(`${channel}${channel}`, 16),
    )
    return { r, g, b }
  }

  if (!longMatch) throw new Error(`Invalid hex color: ${hex}`)

  return {
    r: Number.parseInt(longMatch[1].slice(0, 2), 16),
    g: Number.parseInt(longMatch[1].slice(2, 4), 16),
    b: Number.parseInt(longMatch[1].slice(4, 6), 16),
  }
}
