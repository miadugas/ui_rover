import { openDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry, ImageRecord, ImageRef } from '../types'
import type { UiRoverDB } from './db'
import {
  __resetDatabaseForTests,
  createEntry,
  deleteEntry,
  findByUrl,
  getEntry,
  getImageBlob,
  getThumbBlob,
  importEntries,
  isInMemory,
  listChildren,
  listEntries,
  listImagesForEntry,
  openDb,
  replaceAll,
  storageFallbackReason,
  updateEntry,
} from './db'

interface EntryFixture {
  entry: Entry
  images: ImageRecord[]
}

function createFixture(
  id: string,
  url?: string,
  createdAt = 1,
  imageIds = [`${id}-image`],
): EntryFixture {
  const imageRefs: ImageRef[] = imageIds.map((imageId, order) => ({
    id: imageId,
    order,
    width: 100 + order,
    height: 200 + order,
    mime: 'image/png',
  }))

  return {
    entry: {
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
      tags: [],
      note: '',
      createdAt,
      updatedAt: createdAt,
    },
    images: imageRefs.map((image) => ({
      ...image,
      entryId: id,
      blob: new Blob([`full-${image.id}`], { type: image.mime }),
      thumb: new Blob([`thumb-${image.id}`], { type: image.mime }),
    })),
  }
}

function createComponentFixture(
  id: string,
  parent: Entry,
  createdAt = 1,
  imageIds = [`${id}-image`],
): EntryFixture {
  const fixture = createFixture(id, undefined, createdAt, imageIds)
  const sourceImageId = fixture.entry.images[0]?.id

  return {
    ...fixture,
    entry: {
      ...fixture.entry,
      kind: 'component',
      parentId: parent.id,
      parentImageId: parent.images[0]?.id,
      sourceImageId,
      sourceRect: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      componentTags: ['button'],
    },
  }
}

async function seedV1Database(fixtures: readonly EntryFixture[]): Promise<void> {
  const database = await openDB<UiRoverDB>('ui-rover', 1, {
    upgrade(upgradeDatabase) {
      const entries = upgradeDatabase.createObjectStore('entries', {
        keyPath: 'id',
      })
      entries.createIndex('by-url', 'url', { unique: true })
      entries.createIndex('by-kind', 'kind')
      entries.createIndex('by-createdAt', 'createdAt')

      const images = upgradeDatabase.createObjectStore('images', {
        keyPath: 'id',
      })
      images.createIndex('by-entry', 'entryId')
    },
  })
  const transaction = database.transaction(['entries', 'images'], 'readwrite')

  for (const fixture of fixtures) {
    await transaction.objectStore('entries').add(fixture.entry)
    for (const image of fixture.images) {
      await transaction.objectStore('images').add(image)
    }
  }

  await transaction.done
  database.close()
}

describe('IndexedDB persistence', () => {
  beforeEach(async () => {
    await __resetDatabaseForTests()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await __resetDatabaseForTests()
  })

  it('upgrades v1 data without replacing stores and adds by-parent', async () => {
    const parent = createFixture(
      'upgrade-parent',
      'https://instagram.com/p/upgrade-parent',
      10,
    )
    const child = createComponentFixture('upgrade-child', parent.entry, 20)
    await seedV1Database([parent, child])

    const database = await openDb()

    expect(database).not.toBeNull()
    expect(database?.transaction('entries').store.indexNames).toContain(
      'by-parent',
    )
    expect((await listEntries()).map((entry) => entry.id)).toEqual([
      child.entry.id,
      parent.entry.id,
    ])
    expect(await listChildren(parent.entry.id)).toEqual([child.entry])
    expect(await getImageBlob(parent.images[0]!.id)).toBeDefined()
    expect(await getImageBlob(child.images[0]!.id)).toBeDefined()
  })

  it('reports an upgrade failure before falling back to memory', async () => {
    const database = await openDB('ui-rover', 1, {
      upgrade(upgradeDatabase) {
        const images = upgradeDatabase.createObjectStore('images', {
          keyPath: 'id',
        })
        images.createIndex('by-entry', 'entryId')
      },
    })
    database.close()

    expect(await openDb()).toBeNull()
    expect(isInMemory()).toBe(true)
    expect(storageFallbackReason()).toBe('upgrade-failed')
  })

  it('rolls back createEntry when the second image fails', async () => {
    const fixture = createFixture(
      'atomic-create',
      'https://instagram.com/p/atomic-create',
      1,
      ['duplicate-image', 'duplicate-image'],
    )

    await expect(createEntry(fixture.entry, fixture.images)).rejects.toThrow()

    expect(await getEntry(fixture.entry.id)).toBeUndefined()
    expect(await listImagesForEntry(fixture.entry.id)).toEqual([])
    expect(await getImageBlob('duplicate-image')).toBeUndefined()
  })

  it('deletes an entry and all of its images in one cascade', async () => {
    const fixture = createFixture(
      'delete-me',
      'https://instagram.com/p/delete-me',
      1,
      ['image-second', 'image-first'],
    )
    fixture.images[0].order = 1
    fixture.images[1].order = 0

    await createEntry(fixture.entry, fixture.images)

    expect(
      (await listImagesForEntry(fixture.entry.id)).map((image) => image.id),
    ).toEqual(['image-first', 'image-second'])
    expect(await getThumbBlob('image-first')).toBeDefined()

    await deleteEntry(fixture.entry.id)

    expect(await getEntry(fixture.entry.id)).toBeUndefined()
    expect(await listImagesForEntry(fixture.entry.id)).toEqual([])
    expect(await getImageBlob('image-second')).toBeUndefined()
    expect(await getThumbBlob('image-first')).toBeUndefined()
  })

  it('cascades parent deletion to component entries and their images', async () => {
    const parent = createFixture(
      'cascade-parent',
      'https://instagram.com/p/cascade-parent',
      1,
      ['parent-first', 'parent-second'],
    )
    const firstChild = createComponentFixture('cascade-child-a', parent.entry)
    const secondChild = createComponentFixture('cascade-child-b', parent.entry)
    await createEntry(parent.entry, parent.images)
    await createEntry(firstChild.entry, firstChild.images)
    await createEntry(secondChild.entry, secondChild.images)

    await deleteEntry(parent.entry.id)

    expect(await getEntry(parent.entry.id)).toBeUndefined()
    expect(await getEntry(firstChild.entry.id)).toBeUndefined()
    expect(await getEntry(secondChild.entry.id)).toBeUndefined()
    for (const image of [
      ...parent.images,
      ...firstChild.images,
      ...secondChild.images,
    ]) {
      expect(await getImageBlob(image.id)).toBeUndefined()
    }
  })

  it('rolls back a cascade when a child image delete fails', async () => {
    const parent = createFixture(
      'atomic-cascade-parent',
      'https://instagram.com/p/atomic-cascade-parent',
    )
    const firstChild = createComponentFixture(
      'atomic-cascade-child-a',
      parent.entry,
    )
    const failingChild = createComponentFixture(
      'atomic-cascade-child-b',
      parent.entry,
    )
    await createEntry(parent.entry, parent.images)
    await createEntry(firstChild.entry, firstChild.images)
    await createEntry(failingChild.entry, failingChild.images)

    const failingImageId = failingChild.images[0]!.id
    const originalDelete = IDBObjectStore.prototype.delete
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      query,
    ) {
      if (query === failingImageId) {
        throw new DOMException('Forced delete failure', 'UnknownError')
      }
      return originalDelete.call(this, query)
    })

    await expect(deleteEntry(parent.entry.id)).rejects.toThrow(
      'Forced delete failure',
    )

    expect(await getEntry(parent.entry.id)).toEqual(parent.entry)
    expect(await getEntry(firstChild.entry.id)).toEqual(firstChild.entry)
    expect(await getEntry(failingChild.entry.id)).toEqual(failingChild.entry)
    for (const image of [
      ...parent.images,
      ...firstChild.images,
      ...failingChild.images,
    ]) {
      expect(await getImageBlob(image.id)).toBeDefined()
    }
  })

  it('rejects a second entry with the same URL', async () => {
    const first = createFixture(
      'first-url',
      'https://instagram.com/p/shared-url',
    )
    const second = createFixture(
      'second-url',
      'https://instagram.com/p/shared-url',
    )

    await createEntry(first.entry, first.images)
    await expect(createEntry(second.entry, second.images)).rejects.toThrow()

    expect(await listEntries()).toEqual([first.entry])
    expect(await findByUrl(first.entry.url)).toEqual(first.entry)
  })

  it('stores multiple entries without URLs', async () => {
    const first = createFixture('url-less-first')
    const second = createFixture('url-less-second')

    await createEntry(first.entry, first.images)
    await createEntry(second.entry, second.images)

    expect((await listEntries()).map((entry) => entry.id)).toEqual([
      second.entry.id,
      first.entry.id,
    ])
  })

  describe('component validation', () => {
    it('rejects a missing parent', async () => {
      const missingParent = createFixture('missing-parent').entry
      const component = createComponentFixture('orphan', missingParent)

      await expect(
        createEntry(component.entry, component.images),
      ).rejects.toThrow('existing parent')
      expect(await getEntry(component.entry.id)).toBeUndefined()
    })

    it('rejects a component parent', async () => {
      const parent = createFixture(
        'root-parent',
        'https://instagram.com/p/root-parent',
      )
      const componentParent = createComponentFixture(
        'component-parent',
        parent.entry,
      )
      const grandchild = createComponentFixture(
        'component-grandchild',
        componentParent.entry,
      )
      await createEntry(parent.entry, parent.images)
      await createEntry(componentParent.entry, componentParent.images)

      await expect(
        createEntry(grandchild.entry, grandchild.images),
      ).rejects.toThrow('cannot be the parent')
    })

    it('rejects a parent image that is not on the parent', async () => {
      const parent = createFixture(
        'wrong-parent-image-parent',
        'https://instagram.com/p/wrong-parent-image-parent',
      )
      const component = createComponentFixture(
        'wrong-parent-image',
        parent.entry,
      )
      component.entry.parentImageId = 'not-on-parent'
      await createEntry(parent.entry, parent.images)

      await expect(
        createEntry(component.entry, component.images),
      ).rejects.toThrow('image on its parent')
    })

    it('rejects a source image other than its own image', async () => {
      const parent = createFixture(
        'wrong-source-parent',
        'https://instagram.com/p/wrong-source-parent',
      )
      const component = createComponentFixture('wrong-source', parent.entry)
      component.entry.sourceImageId = 'not-the-component-image'
      await createEntry(parent.entry, parent.images)

      await expect(
        createEntry(component.entry, component.images),
      ).rejects.toThrow('source image')
    })

    it('rejects a component with two images', async () => {
      const parent = createFixture(
        'two-image-parent',
        'https://instagram.com/p/two-image-parent',
      )
      const component = createComponentFixture(
        'two-image-component',
        parent.entry,
        1,
        ['component-first', 'component-second'],
      )
      await createEntry(parent.entry, parent.images)

      await expect(
        createEntry(component.entry, component.images),
      ).rejects.toThrow('exactly one image')
    })

    it('rejects a parentId on a non-component entry', async () => {
      const entry = createFixture(
        'non-component-child',
        'https://instagram.com/p/non-component-child',
      )
      entry.entry.parentId = 'parent'

      await expect(createEntry(entry.entry, entry.images)).rejects.toThrow(
        'cannot have a parent',
      )
    })

    it('rejects component tags on a non-component entry', async () => {
      const entry = createFixture(
        'non-component-tags',
        'https://instagram.com/p/non-component-tags',
      )
      entry.entry.componentTags = ['button']

      await expect(createEntry(entry.entry, entry.images)).rejects.toThrow(
        'cannot have component tags',
      )
    })
  })

  it('lists children oldest first', async () => {
    const parent = createFixture(
      'ordered-parent',
      'https://instagram.com/p/ordered-parent',
    )
    const newer = createComponentFixture('ordered-child-a', parent.entry, 20)
    const older = createComponentFixture('ordered-child-z', parent.entry, 10)
    await createEntry(parent.entry, parent.images)
    await createEntry(newer.entry, newer.images)
    await createEntry(older.entry, older.images)

    expect((await listChildren(parent.entry.id)).map((entry) => entry.id)).toEqual(
      [older.entry.id, newer.entry.id],
    )
  })

  it('serializes concurrent patches for the same entry', async () => {
    const fixture = createFixture(
      'serialized',
      'https://instagram.com/p/serialized',
    )
    await createEntry(fixture.entry, fixture.images)

    await Promise.all([
      updateEntry(fixture.entry.id, { note: 'kept note' }),
      updateEntry(fixture.entry.id, { tags: ['kept-tag'] }),
    ])

    expect(await getEntry(fixture.entry.id)).toMatchObject({
      note: 'kept note',
      tags: ['kept-tag'],
    })
  })

  it('drops an optional key instead of storing an undefined tombstone', async () => {
    const fixture = createFixture(
      'clear-crop',
      'https://instagram.com/p/clear-crop',
    )
    await createEntry(fixture.entry, fixture.images)
    await updateEntry(fixture.entry.id, {
      crop: { imageId: 'clear-crop-image', x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    })

    expect((await getEntry(fixture.entry.id))?.crop).toBeDefined()

    await updateEntry(fixture.entry.id, { crop: undefined })

    const stored = await getEntry(fixture.entry.id)
    expect(stored).toBeDefined()
    expect(Object.keys(stored as object)).not.toContain('crop')
  })

  it('rolls back an import when a middle record fails', async () => {
    const existing = createFixture(
      'existing-import',
      'https://instagram.com/p/existing-import',
    )
    const first = createFixture(
      'import-first',
      'https://instagram.com/p/import-first',
    )
    const failing = createFixture(
      'import-failing',
      existing.entry.url!,
    )
    const third = createFixture(
      'import-third',
      'https://instagram.com/p/import-third',
    )
    await createEntry(existing.entry, existing.images)

    await expect(importEntries([first, failing, third])).rejects.toThrow()

    expect(await listEntries()).toEqual([existing.entry])
    expect(await getImageBlob(first.images[0].id)).toBeUndefined()
    expect(await getImageBlob(existing.images[0].id)).toBeDefined()
  })

  it('keeps old data when replaceAll fails after clearing', async () => {
    const existing = createFixture(
      'existing-replace',
      'https://instagram.com/p/existing-replace',
    )
    const first = createFixture(
      'replace-first',
      'https://instagram.com/p/replacement-duplicate',
    )
    const failing = createFixture(
      'replace-failing',
      'https://instagram.com/p/replacement-duplicate',
    )
    await createEntry(existing.entry, existing.images)

    await expect(replaceAll([first, failing])).rejects.toThrow()

    expect(await listEntries()).toEqual([existing.entry])
    expect(await getImageBlob(existing.images[0].id)).toBeDefined()
    expect(await getImageBlob(first.images[0].id)).toBeUndefined()
  })
})

describe('in-memory fallback', () => {
  beforeEach(async () => {
    await __resetDatabaseForTests({ forceInMemory: true })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await __resetDatabaseForTests()
  })

  it('matches create, newest-first list, and cascading delete behavior', async () => {
    const older = createFixture(
      'memory-older',
      'https://instagram.com/p/memory-older',
      10,
    )
    const newer = createFixture(
      'memory-newer',
      'https://instagram.com/p/memory-newer',
      20,
    )

    expect(await openDb()).toBeNull()
    expect(isInMemory()).toBe(true)
    expect(storageFallbackReason()).toBe('unavailable')

    await createEntry(older.entry, older.images)
    await createEntry(newer.entry, newer.images)

    expect((await listEntries()).map((entry) => entry.id)).toEqual([
      newer.entry.id,
      older.entry.id,
    ])
    expect(await getImageBlob(older.images[0].id)).toBeInstanceOf(Blob)

    await deleteEntry(older.entry.id)

    expect(await getEntry(older.entry.id)).toBeUndefined()
    expect(await getImageBlob(older.images[0].id)).toBeUndefined()
    expect(await listEntries()).toEqual([newer.entry])
  })

  it('stores multiple entries without URLs', async () => {
    const first = createFixture('memory-url-less-first')
    const second = createFixture('memory-url-less-second')

    await createEntry(first.entry, first.images)
    await createEntry(second.entry, second.images)

    expect((await listEntries()).map((entry) => entry.id)).toEqual([
      second.entry.id,
      first.entry.id,
    ])
  })

  it('matches component validation, child ordering, and cascade behavior', async () => {
    const parent = createFixture(
      'memory-parent',
      'https://instagram.com/p/memory-parent',
    )
    const newer = createComponentFixture('memory-child-a', parent.entry, 20)
    const older = createComponentFixture('memory-child-z', parent.entry, 10)
    await createEntry(parent.entry, parent.images)
    await createEntry(newer.entry, newer.images)
    await createEntry(older.entry, older.images)

    expect((await listChildren(parent.entry.id)).map((entry) => entry.id)).toEqual(
      [older.entry.id, newer.entry.id],
    )

    await deleteEntry(parent.entry.id)

    expect(await getEntry(parent.entry.id)).toBeUndefined()
    expect(await getEntry(newer.entry.id)).toBeUndefined()
    expect(await getEntry(older.entry.id)).toBeUndefined()
    expect(await getImageBlob(parent.images[0]!.id)).toBeUndefined()
    expect(await getImageBlob(newer.images[0]!.id)).toBeUndefined()
    expect(await getImageBlob(older.images[0]!.id)).toBeUndefined()
  })
})
