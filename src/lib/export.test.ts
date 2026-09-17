import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeThumb } from '../features/capture/imageMeta'
import type { Entry, ExportFileV1, ImageRecord, ImageRef, RoleMap } from '../types'
import {
  __resetDatabaseForTests,
  createEntry,
  listEntries,
  listImagesForEntry,
} from './db'
import type { ImportEntry } from './db'
import {
  buildExport,
  estimateExportBytes,
  importMerge,
  importReplace,
  prepareImport,
  validateExportFile,
} from './export'

vi.mock('../features/capture/imageMeta', () => ({
  makeThumb: vi.fn(async () =>
    new Blob(['thumb'], { type: 'image/jpeg' }),
  ),
}))

const ROLE_MAP: RoleMap = {
  background: '#ffffff',
  surface: '#eeeeee',
  text: '#111111',
  muted: '#777777',
  primary: '#ff0000',
  accent: '#0000ff',
}

function fixture(
  id: string,
  url: string,
  createdAt = 1,
  imageIds = [`${id}-image`],
): ImportEntry {
  const imageRefs: ImageRef[] = imageIds.map((imageId, order) => ({
    id: imageId,
    order,
    width: 120 + order,
    height: 240 + order,
    mime: 'image/png',
  }))
  const entry: Entry = {
    id,
    url,
    platform: 'instagram',
    shortcode: `shortcode-${id}`,
    kind: 'design',
    images: imageRefs,
    tags: ['reference'],
    note: `note-${id}`,
    createdAt,
    updatedAt: createdAt,
  }
  const images: ImageRecord[] = imageRefs.map((image) => ({
    ...image,
    entryId: id,
    blob: new Blob([`full-image-${id}-${image.id}`], { type: image.mime }),
    thumb: new Blob([`thumb-${image.id}`], { type: 'image/jpeg' }),
  }))

  return { entry, images }
}

function validExportFile(): ExportFileV1 {
  return {
    format: 'ui_rover',
    version: 1,
    exportedAt: '2026-09-15T12:00:00.000Z',
    entries: [
      {
        id: 'valid-entry',
        url: 'https://instagram.com/p/valid-entry',
        platform: 'instagram',
        shortcode: 'valid-entry',
        kind: 'palette',
        images: [
          {
            id: 'valid-image',
            order: 0,
            width: 100,
            height: 200,
            mime: 'image/png',
            dataBase64: btoa('image'),
          },
        ],
        colors: ['#ffffff', '#ff0000', '#000000'],
        roleMap: { ...ROLE_MAP },
        blockOverrides: { 'ecommerce.hero': '#ff0000' },
        mockTemplate: 'ecommerce',
        tags: ['palette'],
        note: 'valid',
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  }
}

function expectProblem(value: unknown, path: string): void {
  const result = validateExportFile(value)
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected validation failure at ${path}`)
  expect(result.problem).toContain(path)
}

function cloneForIndexedDb<T>(value: T): T {
  if (value instanceof Blob) return value.slice(0, value.size, value.type) as T
  if (Array.isArray(value)) return value.map(cloneForIndexedDb) as T
  if (typeof value !== 'object' || value === null) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneForIndexedDb(child)]),
  ) as T
}

function imageMetadata(image: ImageRecord) {
  return {
    id: image.id,
    entryId: image.entryId,
    order: image.order,
    width: image.width,
    height: image.height,
    mime: image.mime,
  }
}

describe('export and import', () => {
  beforeEach(async () => {
    vi.stubGlobal('structuredClone', cloneForIndexedDb)
    await __resetDatabaseForTests()
  })

  afterEach(async () => {
    await __resetDatabaseForTests()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('round-trips entries, image metadata, and full image blobs', async () => {
    const older = fixture(
      'roundtrip-older',
      'https://instagram.com/p/roundtrip-older',
      10,
      ['older-first', 'older-second'],
    )
    const newer = fixture(
      'roundtrip-newer',
      'https://instagram.com/p/roundtrip-newer',
      20,
    )
    older.entry.kind = 'palette'
    older.entry.colors = ['#ffffff', '#ff0000', '#000000']
    older.entry.roleMap = { ...ROLE_MAP }

    await createEntry(older.entry, older.images)
    await createEntry(newer.entry, newer.images)

    const expectedBytes = [...older.images, ...newer.images].reduce(
      (total, image) => total + image.blob.size,
      0,
    )
    expect(await estimateExportBytes()).toBe(expectedBytes)

    const { file, totalImageBytes } = await buildExport()
    expect(totalImageBytes).toBe(expectedBytes)

    await __resetDatabaseForTests()

    const validation = validateExportFile(JSON.parse(JSON.stringify(file)))
    expect(validation.ok).toBe(true)
    if (!validation.ok) throw new Error(validation.problem)

    const batch = await prepareImport(validation.file)
    await expect(importMerge(batch)).resolves.toEqual({
      imported: 2,
      skipped: 0,
    })

    expect(await listEntries()).toEqual([newer.entry, older.entry])

    for (const expected of [older, newer]) {
      const storedImages = await listImagesForEntry(expected.entry.id)
      expect(storedImages.map(imageMetadata)).toEqual(
        expected.images.map(imageMetadata),
      )
      expect(storedImages.map((image) => image.blob.size)).toEqual(
        expected.images.map((image) => image.blob.size),
      )
    }

    expect(vi.mocked(makeThumb)).toHaveBeenCalledTimes(3)
  })

  it('skips an existing URL and imports the remaining entry', async () => {
    const existing = fixture(
      'merge-existing',
      'https://instagram.com/p/merge-existing',
    )
    const collision = fixture('merge-collision', existing.entry.url)
    const fresh = fixture(
      'merge-fresh',
      'https://instagram.com/p/merge-fresh',
    )
    await createEntry(existing.entry, existing.images)

    await expect(importMerge([collision, fresh])).resolves.toEqual({
      imported: 1,
      skipped: 1,
    })
    expect((await listEntries()).map((entry) => entry.id).sort()).toEqual([
      existing.entry.id,
      fresh.entry.id,
    ])
  })

  it('rejects invalid export schemas at the first offending path', () => {
    expectProblem({ source: 'foreign' }, 'format')
    expectProblem({ ...validExportFile(), version: 2 }, 'version')

    const badColor = validExportFile()
    badColor.entries[0].colors = ['not-a-hex']
    expectProblem(badColor, 'entries[0].colors[0]')

    const incompleteRoles = validExportFile()
    incompleteRoles.entries[0].roleMap = {
      background: '#ffffff',
    } as RoleMap
    expectProblem(incompleteRoles, 'entries[0].roleMap.surface')
  })

  it('round-trips paletteSource and crop through export and import', async () => {
    const entryWithRead = fixture(
      'read-fields',
      'https://instagram.com/p/read-fields',
    )
    entryWithRead.entry.kind = 'palette'
    entryWithRead.entry.colors = ['#ffffff', '#ff0000', '#000000']
    entryWithRead.entry.roleMap = { ...ROLE_MAP }
    entryWithRead.entry.paletteSource = 'ocr'
    entryWithRead.entry.crop = {
      imageId: 'read-fields-image',
      x: 0.1,
      y: 0.2,
      w: 0.5,
      h: 0.3,
    }
    await createEntry(entryWithRead.entry, entryWithRead.images)

    const { file } = await buildExport()
    await __resetDatabaseForTests()

    const validation = validateExportFile(JSON.parse(JSON.stringify(file)))
    expect(validation.ok).toBe(true)
    if (!validation.ok) throw new Error(validation.problem)

    const batch = await prepareImport(validation.file)
    await importMerge(batch)

    const [imported] = await listEntries()
    expect(imported.paletteSource).toBe('ocr')
    expect(imported.crop).toEqual(entryWithRead.entry.crop)
  })

  it('validates a file without paletteSource/crop unchanged', () => {
    const file = validExportFile()
    const validation = validateExportFile(file)
    expect(validation.ok).toBe(true)
  })

  it('rejects an invalid paletteSource, crop.imageId, and crop.w', () => {
    const badSource = validExportFile()
    // @ts-expect-error deliberately invalid for the test
    badSource.entries[0].paletteSource = 'manual'
    expectProblem(badSource, 'entries[0].paletteSource')

    const badImageId = validExportFile()
    badImageId.entries[0].crop = {
      imageId: 'not-this-entrys-image',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.2,
    }
    expectProblem(badImageId, 'entries[0].crop.imageId')

    const tinyCrop = validExportFile()
    tinyCrop.entries[0].crop = {
      imageId: 'valid-image',
      x: 0.1,
      y: 0.1,
      w: 0.01,
      h: 0.2,
    }
    expectProblem(tinyCrop, 'entries[0].crop.w')
  })

  it('rolls back a merge when a later image id collides', async () => {
    const first = fixture(
      'atomic-merge-first',
      'https://instagram.com/p/atomic-merge-first',
      1,
      ['duplicate-import-image'],
    )
    const second = fixture(
      'atomic-merge-second',
      'https://instagram.com/p/atomic-merge-second',
      2,
      ['duplicate-import-image'],
    )

    await expect(importMerge([first, second])).rejects.toThrow()
    expect(await listEntries()).toEqual([])
  })

  it('keeps old data when a replacement batch fails', async () => {
    const existing = fixture(
      'replace-existing',
      'https://instagram.com/p/replace-existing',
    )
    const first = fixture(
      'replace-first',
      'https://instagram.com/p/replace-first',
      1,
      ['duplicate-replace-image'],
    )
    const second = fixture(
      'replace-second',
      'https://instagram.com/p/replace-second',
      2,
      ['duplicate-replace-image'],
    )
    await createEntry(existing.entry, existing.images)

    await expect(importReplace([first, second])).rejects.toThrow()
    expect(await listEntries()).toEqual([existing.entry])
    expect(await listImagesForEntry(existing.entry.id)).toHaveLength(1)
  })
})
