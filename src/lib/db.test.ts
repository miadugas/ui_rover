import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Entry, ImageRecord, ImageRef } from '../types'
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
  listEntries,
  listImagesForEntry,
  openDb,
  replaceAll,
  updateEntry,
} from './db'

interface EntryFixture {
  entry: Entry
  images: ImageRecord[]
}

function createFixture(
  id: string,
  url: string,
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
      url,
      platform: 'instagram',
      shortcode: `shortcode-${id}`,
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

describe('IndexedDB persistence', () => {
  beforeEach(async () => {
    await __resetDatabaseForTests()
  })

  afterEach(async () => {
    await __resetDatabaseForTests()
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
      existing.entry.url,
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
})
