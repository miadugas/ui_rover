import { makeThumb } from '../features/capture/imageMeta'
import { MOCK_TEMPLATE_IDS, ROLES } from '../types'
import type { Entry, ExportFileV1, ImageRecord } from '../types'
import {
  findByUrl,
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
const KINDS = new Set(['palette', 'design'])
const MOCK_TEMPLATES = new Set<string>(MOCK_TEMPLATE_IDS)

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

function validateEntry(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`

  for (const key of ['id', 'url', 'shortcode', 'note'] as const) {
    const problem = stringProblem(value[key], `${path}.${key}`)
    if (problem) return problem
  }

  if (typeof value.platform !== 'string' || !PLATFORMS.has(value.platform)) {
    return `${path}.platform must be instagram or threads`
  }

  if (typeof value.kind !== 'string' || !KINDS.has(value.kind)) {
    return `${path}.kind must be palette or design`
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

  for (const key of ['author', 'sourceImageId'] as const) {
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

  return null
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

export async function importMerge(
  batch: ImportEntry[],
): Promise<{ imported: number; skipped: number }> {
  const existingEntries = await listEntries()
  const reservedIds = new Set(existingEntries.map((entry) => entry.id))
  const reservedUrls = new Set<string>()
  const importable: ImportEntry[] = []

  for (const item of batch) {
    const hasIdCollision = reservedIds.has(item.entry.id)
    const hasUrlCollision =
      reservedUrls.has(item.entry.url) ||
      Boolean(await findByUrl(item.entry.url))

    if (hasIdCollision || hasUrlCollision) continue

    reservedIds.add(item.entry.id)
    reservedUrls.add(item.entry.url)
    importable.push(item)
  }

  if (importable.length > 0) await importEntries(importable)

  return {
    imported: importable.length,
    skipped: batch.length - importable.length,
  }
}

export function importReplace(batch: ImportEntry[]): Promise<void> {
  return replaceAll(batch)
}
