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
  resolveImport,
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
  url?: string,
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
    ...(url
      ? {
          url,
          platform: 'instagram' as const,
          shortcode: `shortcode-${id}`,
        }
      : {}),
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

function componentFixture(
  id: string,
  parent: ImportEntry,
  createdAt = 1,
): ImportEntry {
  const component = fixture(id, undefined, createdAt)
  const parentImage = parent.entry.images[0]
  const componentImage = component.entry.images[0]
  if (!parentImage || !componentImage) throw new Error('Fixture image missing')

  component.entry = {
    ...component.entry,
    kind: 'component',
    parentId: parent.entry.id,
    parentImageId: parentImage.id,
    sourceImageId: componentImage.id,
    sourceRect: { x: 0.1, y: 0.2, w: 0.4, h: 0.3 },
    componentTags: ['button', 'nav'],
  }

  return component
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

function validComponentExportFile(): ExportFileV1 {
  const file = validExportFile()
  file.entries.push({
    id: 'valid-component',
    kind: 'component',
    images: [
      {
        id: 'valid-component-image',
        order: 0,
        width: 80,
        height: 40,
        mime: 'image/png',
        dataBase64: btoa('component-image'),
      },
    ],
    sourceImageId: 'valid-component-image',
    parentId: 'valid-entry',
    parentImageId: 'valid-image',
    sourceRect: { x: 0.1, y: 0.2, w: 0.4, h: 0.3 },
    componentTags: ['button', 'nav'],
    tags: ['reference'],
    note: 'component',
    createdAt: 2,
    updatedAt: 2,
  })
  return file
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

  it('round-trips a URL-less parent, component, and full image blobs', async () => {
    const parent = fixture('roundtrip-parent', undefined, 10, [
      'parent-first',
      'parent-second',
    ])
    const component = componentFixture('roundtrip-component', parent, 20)

    await createEntry(parent.entry, parent.images)
    await createEntry(component.entry, component.images)

    const expectedBytes = [...parent.images, ...component.images].reduce(
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
      orphaned: 0,
    })

    expect(await listEntries()).toEqual([component.entry, parent.entry])

    for (const expected of [parent, component]) {
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
    const collision = fixture(
      'merge-collision',
      'https://instagram.com/p/merge-existing',
    )
    const fresh = fixture(
      'merge-fresh',
      'https://instagram.com/p/merge-fresh',
    )
    await createEntry(existing.entry, existing.images)

    await expect(importMerge([collision, fresh])).resolves.toEqual({
      imported: 1,
      skipped: 1,
      orphaned: 0,
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

  it('imports a v0.2.0-style file unchanged', async () => {
    const file = validExportFile()
    const validation = validateExportFile(file)
    expect(validation.ok).toBe(true)
    if (!validation.ok) throw new Error(validation.problem)

    const batch = await prepareImport(validation.file)
    await expect(importReplace(batch)).resolves.toEqual({
      imported: 1,
      skipped: 0,
      orphaned: 0,
    })
    expect(await listEntries()).toEqual([
      {
        ...file.entries[0],
        images: file.entries[0].images.map(
          ({ dataBase64: _dataBase64, ...image }) => image,
        ),
      },
    ])
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

  it('accepts URL-less entries and valid component fields', () => {
    const urlLess = validExportFile()
    delete urlLess.entries[0].url
    delete urlLess.entries[0].platform
    delete urlLess.entries[0].shortcode

    expect(validateExportFile(urlLess).ok).toBe(true)
    expect(validateExportFile(validComponentExportFile()).ok).toBe(true)
  })

  it('rejects partial URL metadata and author without a URL', () => {
    const platformWithoutUrl = validExportFile()
    delete platformWithoutUrl.entries[0].url
    delete platformWithoutUrl.entries[0].shortcode
    expectProblem(platformWithoutUrl, 'entries[0].platform')

    const missingPlatform = validExportFile()
    delete missingPlatform.entries[0].platform
    expectProblem(missingPlatform, 'entries[0].platform')

    const authorWithoutUrl = validExportFile()
    delete authorWithoutUrl.entries[0].url
    delete authorWithoutUrl.entries[0].platform
    delete authorWithoutUrl.entries[0].shortcode
    authorWithoutUrl.entries[0].author = 'author'
    expectProblem(authorWithoutUrl, 'entries[0].author')
  })

  it('rejects invalid component provenance and image fields', () => {
    const missingParentId = validComponentExportFile()
    delete missingParentId.entries[1].parentId
    expectProblem(missingParentId, 'entries[1].parentId')

    const missingParentImageId = validComponentExportFile()
    delete missingParentImageId.entries[1].parentImageId
    expectProblem(missingParentImageId, 'entries[1].parentImageId')

    const invalidSourceRect = validComponentExportFile()
    invalidSourceRect.entries[1].sourceRect = {
      x: 0.1,
      y: 0.1,
      w: 0.01,
      h: 0.2,
    }
    expectProblem(invalidSourceRect, 'entries[1].sourceRect.w')

    const invalidTag = validComponentExportFile()
    // @ts-expect-error deliberately invalid for the test
    invalidTag.entries[1].componentTags = ['button', 'tooltip']
    expectProblem(invalidTag, 'entries[1].componentTags[1]')

    const twoImages = validComponentExportFile()
    twoImages.entries[1].images.push({
      ...twoImages.entries[1].images[0],
      id: 'second-component-image',
    })
    expectProblem(twoImages, 'entries[1].images')

    const wrongSourceImage = validComponentExportFile()
    wrongSourceImage.entries[1].sourceImageId = 'wrong-image'
    expectProblem(wrongSourceImage, 'entries[1].sourceImageId')
  })

  it('rejects component provenance on non-component entries', () => {
    for (const [key, value] of [
      ['parentId', 'parent'],
      ['parentImageId', 'parent-image'],
      ['sourceRect', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
    ] as const) {
      const file = validExportFile()
      Object.assign(file.entries[0], { [key]: value })
      expectProblem(file, `entries[0].${key}`)
    }
  })

  it('rejects component tags on non-component entries', () => {
    const file = validExportFile()
    file.entries[0].componentTags = ['button']

    expectProblem(file, 'entries[0].componentTags')
  })

  describe('resolveImport', () => {
    it('orders an accepted parent before a component', () => {
      const parent = fixture('ordered-parent')
      const component = componentFixture('ordered-component', parent)

      const resolution = resolveImport([component, parent], {
        mode: 'replace',
        existing: [],
      })

      expect(resolution).toEqual({
        accepted: [parent, component],
        skipped: 0,
        orphaned: 0,
      })
    })

    it('orphans a component when its parent is absent', () => {
      const parent = fixture('absent-parent')
      const component = componentFixture('orphan-component', parent)

      expect(
        resolveImport([component], { mode: 'replace', existing: [] }),
      ).toEqual({ accepted: [], skipped: 0, orphaned: 1 })
    })

    it('orphans a component when its parent is skipped for a URL collision', () => {
      const sharedUrl = 'https://instagram.com/p/shared-parent-url'
      const existing = fixture('existing-parent', sharedUrl)
      const collidingParent = fixture('colliding-parent', sharedUrl)
      const component = componentFixture(
        'collision-orphan',
        collidingParent,
      )

      expect(
        resolveImport([component, collidingParent], {
          mode: 'merge',
          existing: [existing.entry],
        }),
      ).toEqual({ accepted: [], skipped: 1, orphaned: 1 })
    })

    it('ignores a pre-existing parent in replace mode', () => {
      const existingParent = fixture('replace-existing-parent')
      const component = componentFixture(
        'replace-orphan',
        existingParent,
      )

      expect(
        resolveImport([component], {
          mode: 'replace',
          existing: [existingParent.entry],
        }),
      ).toEqual({ accepted: [], skipped: 0, orphaned: 1 })
    })

    it('orphans a component when parentImageId is not on its parent', () => {
      const parent = fixture('wrong-image-parent')
      const component = componentFixture('wrong-image-component', parent)
      component.entry.parentImageId = 'missing-parent-image'

      expect(
        resolveImport([component, parent], {
          mode: 'replace',
          existing: [],
        }),
      ).toEqual({ accepted: [parent], skipped: 0, orphaned: 1 })
    })

    it('does not allow a component to parent another component', () => {
      const root = fixture('component-root')
      const componentParent = componentFixture('component-parent', root)
      const grandchild = componentFixture('component-grandchild', componentParent)

      expect(
        resolveImport([grandchild, componentParent, root], {
          mode: 'replace',
          existing: [],
        }),
      ).toEqual({
        accepted: [root, componentParent],
        skipped: 0,
        orphaned: 1,
      })
    })

    it('skips ID and URL collisions inside a merge batch', () => {
      const first = fixture(
        'batch-first',
        'https://instagram.com/p/batch-shared',
      )
      const duplicateUrl = fixture(
        'batch-second',
        'https://instagram.com/p/batch-shared',
      )
      const duplicateId = fixture('batch-first')

      expect(
        resolveImport([first, duplicateUrl, duplicateId], {
          mode: 'merge',
          existing: [],
        }),
      ).toEqual({ accepted: [first], skipped: 2, orphaned: 0 })
    })
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
