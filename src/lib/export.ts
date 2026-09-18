import { makeThumb } from '../features/capture/imageMeta'
import { MIN_CROP_EDGE } from '../features/palette/read/cropRect'
import { COMPONENT_TAGS, MOCK_TEMPLATE_IDS, ROLES } from '../types'
import type { Entry, ExportFileV1, ImageRecord } from '../types'
import {
  importEntries,
  listEntries,
  listImagesForEntry,
  replaceAll,
} from './db'
import type { ImportEntry } from './db'

const ENCODE_CHUNK_BYTES = 3 * 1024 * 1024
const BINARY_STRING_CHUNK_BYTES = 32 * 1024
const DECODE_CHUNK_CHARACTERS = 4 * 1024 * 1024
const HEX_COLOR = /^#[0-9a-f]{6}$/i

const PLATFORMS = new Set(['instagram', 'threads'])
const KINDS = new Set(['palette', 'design', 'component'])
const COMPONENT_TAG_VALUES = new Set<string>(COMPONENT_TAGS)
const MOCK_TEMPLATES = new Set<string>(MOCK_TEMPLATE_IDS)
const PALETTE_SOURCES = new Set(['ocr', 'blobs', 'quantize'])

export const EXPORT_WARN_BYTES = 150 * 1024 * 1024

type ExportEntry = ExportFileV1['entries'][number]
type ExportImage = ExportEntry['images'][number]

export type ExportValidationResult =
  | { ok: true; file: ExportFileV1 }
  | { ok: false; problem: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(problem: string): ExportValidationResult {
  return { ok: false, problem }
}

function stringProblem(value: unknown, path: string): string | null {
  return typeof value === 'string' ? null : `${path} must be a string`
}

function numberProblem(value: unknown, path: string): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? null
    : `${path} must be a number`
}

function hexProblem(value: unknown, path: string): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value)
    ? null
    : `${path} must be a #rrggbb hex color`
}

function validateImage(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`

  for (const key of ['id', 'mime', 'dataBase64'] as const) {
    const problem = stringProblem(value[key], `${path}.${key}`)
    if (problem) return problem
  }

  for (const key of ['order', 'width', 'height'] as const) {
    const problem = numberProblem(value[key], `${path}.${key}`)
    if (problem) return problem
  }

  return null
}

function validateStringArray(value: unknown, path: string): string | null {
  if (!Array.isArray(value)) return `${path} must be an array`

  for (let index = 0; index < value.length; index += 1) {
    const problem = stringProblem(value[index], `${path}[${index}]`)
    if (problem) return problem
  }

  return null
}

function validatePostMetadata(
  value: Record<string, unknown>,
  path: string,
): string | null {
  const hasUrl = 'url' in value

  if (!hasUrl) {
    for (const key of ['platform', 'shortcode', 'author'] as const) {
      if (key in value) return `${path}.${key} must be omitted when url is missing`
    }
    return null
  }

  const urlProblem = stringProblem(value.url, `${path}.url`)
  if (urlProblem) return urlProblem

  if (typeof value.platform !== 'string' || !PLATFORMS.has(value.platform)) {
    return `${path}.platform must be instagram or threads when url is present`
  }

  const shortcodeProblem = stringProblem(value.shortcode, `${path}.shortcode`)
  if (shortcodeProblem) return shortcodeProblem

  if ('author' in value) {
    return stringProblem(value.author, `${path}.author`)
  }

  return null
}

function validateComponentTags(value: unknown, path: string): string | null {
  if (!Array.isArray(value)) return `${path} must be an array`

  for (let index = 0; index < value.length; index += 1) {
    const tag = value[index]
    if (typeof tag !== 'string' || !COMPONENT_TAG_VALUES.has(tag)) {
      return `${path}[${index}] must be a known component tag`
    }
  }

  return null
}

function validateEntry(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`

  for (const key of ['id', 'note'] as const) {
    const problem = stringProblem(value[key], `${path}.${key}`)
    if (problem) return problem
  }

  const postMetadataProblem = validatePostMetadata(value, path)
  if (postMetadataProblem) return postMetadataProblem

  if (typeof value.kind !== 'string' || !KINDS.has(value.kind)) {
    return `${path}.kind must be palette, design, or component`
  }

  for (const key of ['createdAt', 'updatedAt'] as const) {
    const problem = numberProblem(value[key], `${path}.${key}`)
    if (problem) return problem
  }

  const tagsProblem = validateStringArray(value.tags, `${path}.tags`)
  if (tagsProblem) return tagsProblem

  if (!Array.isArray(value.images) || value.images.length === 0) {
    return `${path}.images must be a non-empty array`
  }

  for (let index = 0; index < value.images.length; index += 1) {
    const problem = validateImage(value.images[index], `${path}.images[${index}]`)
    if (problem) return problem
  }

  for (const key of ['sourceImageId'] as const) {
    if (!(key in value)) continue

    const problem = stringProblem(value[key], `${path}.${key}`)
    if (problem) return problem
  }

  if ('colors' in value) {
    if (!Array.isArray(value.colors)) return `${path}.colors must be an array`

    for (let index = 0; index < value.colors.length; index += 1) {
      const problem = hexProblem(value.colors[index], `${path}.colors[${index}]`)
      if (problem) return problem
    }
  }

  if ('roleMap' in value) {
    if (!isRecord(value.roleMap)) return `${path}.roleMap must be an object`

    for (const role of ROLES) {
      const problem = hexProblem(value.roleMap[role], `${path}.roleMap.${role}`)
      if (problem) return problem
    }
  }

  if ('blockOverrides' in value) {
    if (!isRecord(value.blockOverrides)) {
      return `${path}.blockOverrides must be an object`
    }

    for (const [key, color] of Object.entries(value.blockOverrides)) {
      const problem = hexProblem(color, `${path}.blockOverrides.${key}`)
      if (problem) return problem
    }
  }

  if (
    'mockTemplate' in value &&
    (typeof value.mockTemplate !== 'string' ||
      !MOCK_TEMPLATES.has(value.mockTemplate))
  ) {
    return `${path}.mockTemplate must be a known template id`
  }

  if (
    'paletteSource' in value &&
    (typeof value.paletteSource !== 'string' ||
      !PALETTE_SOURCES.has(value.paletteSource))
  ) {
    return `${path}.paletteSource must be ocr, blobs, or quantize`
  }

  if ('crop' in value) {
    const cropProblem = validateCrop(value.crop, value.images, `${path}.crop`)
    if (cropProblem) return cropProblem
  }

  if (value.kind === 'component') {
    if ('componentTags' in value) {
      const componentTagsProblem = validateComponentTags(
        value.componentTags,
        `${path}.componentTags`,
      )
      if (componentTagsProblem) return componentTagsProblem
    }

    for (const key of ['parentId', 'parentImageId'] as const) {
      const problem = stringProblem(value[key], `${path}.${key}`)
      if (problem) return problem
    }

    const sourceRectProblem = validateRect(
      value.sourceRect,
      `${path}.sourceRect`,
    )
    if (sourceRectProblem) return sourceRectProblem

    if (value.images.length !== 1) {
      return `${path}.images must contain exactly one component image`
    }

    const componentImage = value.images[0]
    const componentImageId = isRecord(componentImage)
      ? componentImage.id
      : undefined
    if (value.sourceImageId !== componentImageId) {
      return `${path}.sourceImageId must match the component image id`
    }
  } else {
    for (const key of [
      'parentId',
      'parentImageId',
      'sourceRect',
      'componentTags',
    ] as const) {
      if (key in value) {
        return `${path}.${key} is only allowed on component entries`
      }
    }
  }

  return null
}

function validateRect(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`

  for (const key of ['x', 'y', 'w', 'h'] as const) {
    const problem = numberProblem(value[key], `${path}.${key}`)
    if (problem) return problem
  }

  const x = value.x as number
  const y = value.y as number
  const w = value.w as number
  const h = value.h as number

  if (x < 0 || x > 1) return `${path}.x must be between 0 and 1`
  if (y < 0 || y > 1) return `${path}.y must be between 0 and 1`
  if (w < MIN_CROP_EDGE) return `${path}.w must be at least ${MIN_CROP_EDGE}`
  if (h < MIN_CROP_EDGE) return `${path}.h must be at least ${MIN_CROP_EDGE}`
  if (x + w > 1) return `${path}.w must satisfy x + w <= 1`
  if (y + h > 1) return `${path}.h must satisfy y + h <= 1`

  return null
}

function validateCrop(
  value: unknown,
  images: unknown,
  path: string,
): string | null {
  if (!isRecord(value)) return `${path} must be an object`

  const imageIdProblem = stringProblem(value.imageId, `${path}.imageId`)
  if (imageIdProblem) return imageIdProblem

  const knownImageIds = Array.isArray(images)
    ? new Set(
        images.map((image) => (isRecord(image) ? image.id : undefined)),
      )
    : new Set()
  if (!knownImageIds.has(value.imageId)) {
    return `${path}.imageId must match one of this entry's images`
  }

  return validateRect(value, path)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const encodedChunks: string[] = []

  for (let offset = 0; offset < blob.size; offset += ENCODE_CHUNK_BYTES) {
    const bytes = new Uint8Array(
      await blob.slice(offset, offset + ENCODE_CHUNK_BYTES).arrayBuffer(),
    )
    const binaryChunks: string[] = []

    for (
      let byteOffset = 0;
      byteOffset < bytes.length;
      byteOffset += BINARY_STRING_CHUNK_BYTES
    ) {
      binaryChunks.push(
        String.fromCharCode(
          ...bytes.subarray(
            byteOffset,
            byteOffset + BINARY_STRING_CHUNK_BYTES,
          ),
        ),
      )
    }

    encodedChunks.push(btoa(binaryChunks.join('')))
  }

  return encodedChunks.join('')
}

function base64ToBlob(dataBase64: string, mime: string): Blob {
  const byteChunks: ArrayBuffer[] = []

  for (
    let offset = 0;
    offset < dataBase64.length;
    offset += DECODE_CHUNK_CHARACTERS
  ) {
    const binary = atob(
      dataBase64.slice(offset, offset + DECODE_CHUNK_CHARACTERS),
    )
    const bytes = new Uint8Array(new ArrayBuffer(binary.length))

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    byteChunks.push(bytes.buffer)
  }

  return new Blob(byteChunks, { type: mime })
}

function imageRef(image: ExportImage): Entry['images'][number] {
  return {
    id: image.id,
    order: image.order,
    width: image.width,
    height: image.height,
    mime: image.mime,
  }
}

export async function estimateExportBytes(): Promise<number> {
  const entries = await listEntries()
  let totalImageBytes = 0

  for (const entry of entries) {
    const images = await listImagesForEntry(entry.id)
    for (const image of images) totalImageBytes += image.blob.size
  }

  return totalImageBytes
}

export async function buildExport(): Promise<{
  file: ExportFileV1
  totalImageBytes: number
}> {
  const entries = await listEntries()
  const exportedEntries: ExportEntry[] = []
  let totalImageBytes = 0

  for (const entry of entries) {
    const images = await listImagesForEntry(entry.id)
    const exportedImages: ExportImage[] = []

    for (const image of images) {
      totalImageBytes += image.blob.size
      exportedImages.push({
        id: image.id,
        order: image.order,
        width: image.width,
        height: image.height,
        mime: image.mime,
        dataBase64: await blobToBase64(image.blob),
      })
    }

    exportedEntries.push({ ...entry, images: exportedImages })
  }

  return {
    file: {
      format: 'ui_rover',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: exportedEntries,
    },
    totalImageBytes,
  }
}

export function exportFilename(date: Date = new Date()): string {
  return `ui_rover-${date.toISOString().slice(0, 10)}.json`
}

export function downloadExport(file: ExportFileV1, filename: string): void {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename

  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}

export function validateExportFile(value: unknown): ExportValidationResult {
  if (!isRecord(value)) return invalid('file must be an object')
  if (value.format !== 'ui_rover') {
    return invalid('format must equal "ui_rover"')
  }
  if (value.version !== 1) return invalid('version must equal 1')

  const exportedAtProblem = stringProblem(value.exportedAt, 'exportedAt')
  if (exportedAtProblem) return invalid(exportedAtProblem)
  if (!Array.isArray(value.entries)) return invalid('entries must be an array')

  for (let index = 0; index < value.entries.length; index += 1) {
    const problem = validateEntry(value.entries[index], `entries[${index}]`)
    if (problem) return invalid(problem)
  }

  return { ok: true, file: value as unknown as ExportFileV1 }
}

export async function prepareImport(file: ExportFileV1): Promise<ImportEntry[]> {
  const batch: ImportEntry[] = []

  for (const exportedEntry of file.entries) {
    const imageRecords: ImageRecord[] = []

    for (const image of exportedEntry.images) {
      const blob = base64ToBlob(image.dataBase64, image.mime)
      const thumb = await makeThumb(blob)
      imageRecords.push({
        ...imageRef(image),
        entryId: exportedEntry.id,
        blob,
        thumb,
      })
    }

    const entry: Entry = {
      ...exportedEntry,
      images: exportedEntry.images.map(imageRef),
    }
    batch.push({ entry, images: imageRecords })
  }

  return batch
}

export interface ImportOutcome {
  imported: number
  skipped: number
  orphaned: number
}

export interface ImportResolution {
  accepted: ImportEntry[]
  skipped: number
  orphaned: number
}

export function resolveImport(
  batch: ImportEntry[],
  options: { mode: 'merge' | 'replace'; existing: Entry[] },
): ImportResolution {
  const collisionFree: ImportEntry[] = []
  let skipped = 0

  if (options.mode === 'replace') {
    collisionFree.push(...batch)
  } else {
    const reservedIds = new Set(options.existing.map((entry) => entry.id))
    const reservedUrls = new Set(
      options.existing.flatMap((entry) =>
        entry.url === undefined ? [] : [entry.url],
      ),
    )

    for (const item of batch) {
      const url = item.entry.url
      const hasIdCollision = reservedIds.has(item.entry.id)
      const hasUrlCollision =
        url !== undefined && reservedUrls.has(url)

      if (hasIdCollision || hasUrlCollision) {
        skipped += 1
        continue
      }

      reservedIds.add(item.entry.id)
      if (url !== undefined) reservedUrls.add(url)
      collisionFree.push(item)
    }
  }

  const parentsById = new Map<string, Entry>()
  if (options.mode === 'merge') {
    for (const entry of options.existing) {
      if (entry.kind !== 'component') parentsById.set(entry.id, entry)
    }
  }
  for (const item of collisionFree) {
    if (item.entry.kind !== 'component') {
      parentsById.set(item.entry.id, item.entry)
    }
  }

  const parents: ImportEntry[] = []
  const components: ImportEntry[] = []
  let orphaned = 0

  for (const item of collisionFree) {
    if (item.entry.kind !== 'component') {
      parents.push(item)
      continue
    }

    const parent = item.entry.parentId
      ? parentsById.get(item.entry.parentId)
      : undefined
    const hasParentImage = parent?.images.some(
      (image) => image.id === item.entry.parentImageId,
    )
    if (!parent || !hasParentImage) {
      orphaned += 1
      continue
    }

    components.push(item)
  }

  return {
    accepted: [...parents, ...components],
    skipped,
    orphaned,
  }
}

export async function importMerge(batch: ImportEntry[]): Promise<ImportOutcome> {
  const resolution = resolveImport(batch, {
    mode: 'merge',
    existing: await listEntries(),
  })
  if (resolution.accepted.length > 0) {
    await importEntries(resolution.accepted)
  }

  return {
    imported: resolution.accepted.length,
    skipped: resolution.skipped,
    orphaned: resolution.orphaned,
  }
}

export async function importReplace(
  batch: ImportEntry[],
): Promise<ImportOutcome> {
  const resolution = resolveImport(batch, { mode: 'replace', existing: [] })
  await replaceAll(resolution.accepted)

  return {
    imported: resolution.accepted.length,
    skipped: resolution.skipped,
    orphaned: resolution.orphaned,
  }
}
