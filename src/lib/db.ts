import { deleteDB, openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { Entry, ImageRecord, Kind } from '../types'

const DATABASE_NAME = 'ui-rover'
const DATABASE_VERSION = 2

export type StorageFallbackReason =
  | 'none'
  | 'unavailable'
  | 'upgrade-failed'

export interface UiRoverDB extends DBSchema {
  entries: {
    key: string
    value: Entry
    indexes: {
      'by-url': string
      'by-kind': Kind
      'by-createdAt': number
      'by-parent': string
    }
  }
  images: {
    key: string
    value: ImageRecord
    indexes: {
      'by-entry': string
    }
  }
}

export type EntryPatch = Partial<Omit<Entry, 'id'>>

export interface ImportEntry {
  entry: Entry
  images: ImageRecord[]
}

type ChangeListener = () => void

let databasePromise: Promise<IDBPDatabase<UiRoverDB> | null> | null = null
let inMemory = false
let fallbackReason: StorageFallbackReason = 'none'
let memoryEntries = new Map<string, Entry>()
let memoryImages = new Map<string, ImageRecord>()

const changeListeners = new Set<ChangeListener>()
const updateQueues = new Map<string, Promise<void>>()

function cloneEntry(entry: Entry): Entry {
  return {
    ...entry,
    images: entry.images.map((image) => ({ ...image })),
    tags: [...entry.tags],
    ...(entry.colors ? { colors: [...entry.colors] } : {}),
    ...(entry.roleMap ? { roleMap: { ...entry.roleMap } } : {}),
    ...(entry.blockOverrides
      ? { blockOverrides: { ...entry.blockOverrides } }
      : {}),
    ...(entry.sourceRect ? { sourceRect: { ...entry.sourceRect } } : {}),
    ...(entry.componentTags
      ? { componentTags: [...entry.componentTags] }
      : {}),
  }
}

function cloneImage(image: ImageRecord): ImageRecord {
  return { ...image }
}

// IndexedDB stores the whole `Entry`, and structured clone keeps a key whose
// value is `undefined`. Clearing an optional field (`crop`) therefore has to
// delete the key, not merely spread `undefined` over it — otherwise the stored
// object grows a tombstone that every later read has to reason about.
function applyPatch(currentEntry: Entry, patch: EntryPatch, id: string): Entry {
  const nextEntry: Entry = { ...currentEntry, ...patch, id }
  const keys = nextEntry as unknown as Record<string, unknown>

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete keys[key]
  }

  return nextEntry
}

function constraintError(message: string): DOMException {
  return new DOMException(message, 'ConstraintError')
}

function dataError(message: string): DOMException {
  return new DOMException(message, 'DataError')
}

function assertImagesBelongToEntry(
  entry: Entry,
  images: readonly ImageRecord[],
): void {
  if (images.length === 0) {
    throw dataError('An entry must have at least one image')
  }

  const hasMismatchedImage = images.some((image) => image.entryId !== entry.id)
  if (hasMismatchedImage) {
    throw dataError('Every image must belong to its entry')
  }
}

function assertCreateEntryRelationships(
  entry: Entry,
  images: readonly ImageRecord[],
  parent: Entry | undefined,
): void {
  if (entry.kind !== 'component') {
    if (entry.parentId !== undefined) {
      throw dataError('A non-component entry cannot have a parent')
    }
    if (entry.componentTags !== undefined) {
      throw dataError('A non-component entry cannot have component tags')
    }
    return
  }

  if (!entry.parentId || !parent) {
    throw dataError('A component must reference an existing parent')
  }
  if (parent.kind === 'component') {
    throw dataError('A component cannot be the parent of another component')
  }
  if (
    !entry.parentImageId ||
    !parent.images.some((image) => image.id === entry.parentImageId)
  ) {
    throw dataError('A component must reference an image on its parent')
  }
  if (entry.images.length !== 1 || images.length !== 1) {
    throw dataError('A component must have exactly one image')
  }

  const imageId = entry.images[0]?.id
  if (imageId !== images[0]?.id || entry.sourceImageId !== imageId) {
    throw dataError('A component source image must be its own image')
  }
}

function addToMemoryMaps(
  entries: Map<string, Entry>,
  images: Map<string, ImageRecord>,
  item: ImportEntry,
): void {
  assertImagesBelongToEntry(item.entry, item.images)

  if (entries.has(item.entry.id)) {
    throw constraintError(`Entry ${item.entry.id} already exists`)
  }

  if (item.entry.url) {
    const duplicateUrl = Array.from(entries.values()).some(
      (entry) => entry.url === item.entry.url,
    )
    if (duplicateUrl) {
      throw constraintError(`URL ${item.entry.url} already exists`)
    }
  }

  entries.set(item.entry.id, cloneEntry(item.entry))

  for (const image of item.images) {
    if (images.has(image.id)) {
      throw constraintError(`Image ${image.id} already exists`)
    }
    images.set(image.id, cloneImage(image))
  }
}

function applyMemoryBatch(batch: readonly ImportEntry[], replace: boolean): void {
  const nextEntries = replace
    ? new Map<string, Entry>()
    : new Map(memoryEntries)
  const nextImages = replace
    ? new Map<string, ImageRecord>()
    : new Map(memoryImages)

  for (const item of batch) {
    addToMemoryMaps(nextEntries, nextImages, item)
  }

  memoryEntries = nextEntries
  memoryImages = nextImages
}

function emitChange(): void {
  for (const listener of changeListeners) {
    listener()
  }
}

async function abortAndRethrow(
  transaction: { abort(): void; done: Promise<unknown> },
  error: unknown,
): Promise<never> {
  try {
    transaction.abort()
  } catch {
    // The failed request may already have aborted the transaction.
  }

  await transaction.done.catch(() => undefined)
  throw error
}

async function openIndexedDb(): Promise<IDBPDatabase<UiRoverDB> | null> {
  if (typeof indexedDB === 'undefined') {
    inMemory = true
    fallbackReason = 'unavailable'
    return null
  }

  let upgradeStarted = false

  try {
    return await openDB<UiRoverDB>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        upgradeStarted = true
        void transaction.done.catch(() => undefined)

        if (oldVersion < 1) {
          const entries = database.createObjectStore('entries', {
            keyPath: 'id',
          })
          entries.createIndex('by-url', 'url', { unique: true })
          entries.createIndex('by-kind', 'kind')
          entries.createIndex('by-createdAt', 'createdAt')

          const images = database.createObjectStore('images', {
            keyPath: 'id',
          })
          images.createIndex('by-entry', 'entryId')
        }

        if (oldVersion < 2) {
          transaction
            .objectStore('entries')
            .createIndex('by-parent', 'parentId')
        }
      },
    })
  } catch {
    inMemory = true
    fallbackReason = upgradeStarted ? 'upgrade-failed' : 'unavailable'
    return null
  }
}

export function openDb(): Promise<IDBPDatabase<UiRoverDB> | null> {
  if (inMemory) return Promise.resolve(null)

  databasePromise ??= openIndexedDb()
  return databasePromise
}

export function isInMemory(): boolean {
  return inMemory
}

export function storageFallbackReason(): StorageFallbackReason {
  return fallbackReason
}

export function subscribe(listener: ChangeListener): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

export async function createEntry(
  entry: Entry,
  images: ImageRecord[],
): Promise<void> {
  assertImagesBelongToEntry(entry, images)

  const database = await openDb()
  if (!database) {
    const parent = entry.parentId
      ? memoryEntries.get(entry.parentId)
      : undefined
    assertCreateEntryRelationships(entry, images, parent)
    applyMemoryBatch([{ entry, images }], false)
    emitChange()
    return
  }

  const transaction = database.transaction(['entries', 'images'], 'readwrite')

  try {
    const entryStore = transaction.objectStore('entries')
    const parent = entry.parentId
      ? await entryStore.get(entry.parentId)
      : undefined
    assertCreateEntryRelationships(entry, images, parent)

    await entryStore.add(entry)
    for (const image of images) {
      await transaction.objectStore('images').add(image)
    }
    await transaction.done
  } catch (error) {
    return abortAndRethrow(transaction, error)
  }

  emitChange()
}

export async function deleteEntry(id: string): Promise<void> {
  const database = await openDb()
  if (!database) {
    const entryIds = new Set([id])
    for (const entry of memoryEntries.values()) {
      if (entry.parentId === id) entryIds.add(entry.id)
    }

    for (const [imageId, image] of memoryImages) {
      if (entryIds.has(image.entryId)) memoryImages.delete(imageId)
    }
    for (const entryId of entryIds) {
      memoryEntries.delete(entryId)
    }
    emitChange()
    return
  }

  const transaction = database.transaction(['entries', 'images'], 'readwrite')

  try {
    const entryStore = transaction.objectStore('entries')
    const imageStore = transaction.objectStore('images')
    const childIds = await entryStore.index('by-parent').getAllKeys(id)

    for (const childId of childIds) {
      const childImageIds = await imageStore
        .index('by-entry')
        .getAllKeys(childId)
      for (const imageId of childImageIds) {
        await imageStore.delete(imageId)
      }
      await entryStore.delete(childId)
    }

    const imageIds = await imageStore.index('by-entry').getAllKeys(id)
    for (const imageId of imageIds) {
      await imageStore.delete(imageId)
    }
    await entryStore.delete(id)
    await transaction.done
  } catch (error) {
    return abortAndRethrow(transaction, error)
  }

  emitChange()
}

async function performUpdate(id: string, patch: EntryPatch): Promise<void> {
  const database = await openDb()
  if (!database) {
    const currentEntry = memoryEntries.get(id)
    if (!currentEntry) throw dataError(`Entry ${id} does not exist`)

    const nextEntry = cloneEntry(applyPatch(currentEntry, patch, id))
    if (nextEntry.url) {
      const duplicateUrl = Array.from(memoryEntries.values()).some(
        (entry) => entry.id !== id && entry.url === nextEntry.url,
      )
      if (duplicateUrl) {
        throw constraintError(`URL ${nextEntry.url} already exists`)
      }
    }

    memoryEntries.set(id, nextEntry)
    return
  }

  const transaction = database.transaction('entries', 'readwrite')

  try {
    const store = transaction.objectStore('entries')
    const currentEntry = await store.get(id)
    if (!currentEntry) throw dataError(`Entry ${id} does not exist`)

    await store.put(applyPatch(currentEntry, patch, id))
    await transaction.done
  } catch (error) {
    return abortAndRethrow(transaction, error)
  }
}

export function updateEntry(id: string, patch: EntryPatch): Promise<void> {
  const previousUpdate = updateQueues.get(id) ?? Promise.resolve()
  const queuedUpdate = previousUpdate
    .catch(() => undefined)
    .then(async () => {
      await performUpdate(id, patch)
      emitChange()
    })

  updateQueues.set(id, queuedUpdate)
  void queuedUpdate
    .finally(() => {
      if (updateQueues.get(id) === queuedUpdate) updateQueues.delete(id)
    })
    .catch(() => undefined)

  return queuedUpdate
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const database = await openDb()
  if (!database) {
    const entry = memoryEntries.get(id)
    return entry ? cloneEntry(entry) : undefined
  }

  return database.get('entries', id)
}

export async function listEntries(): Promise<Entry[]> {
  const database = await openDb()
  const entries = database
    ? await database.getAll('entries')
    : Array.from(memoryEntries.values(), cloneEntry)

  return entries.sort(
    (left, right) =>
      right.createdAt - left.createdAt || right.id.localeCompare(left.id),
  )
}

export async function listChildren(parentId: string): Promise<Entry[]> {
  const database = await openDb()
  const entries = database
    ? await database.getAllFromIndex('entries', 'by-parent', parentId)
    : Array.from(memoryEntries.values())
        .filter((entry) => entry.parentId === parentId)
        .map(cloneEntry)

  return entries.sort(
    (left, right) =>
      left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  )
}

export async function getImageBlob(id: string): Promise<Blob | undefined> {
  const database = await openDb()
  if (!database) return memoryImages.get(id)?.blob

  return (await database.get('images', id))?.blob
}

export async function getThumbBlob(id: string): Promise<Blob | undefined> {
  const database = await openDb()
  if (!database) return memoryImages.get(id)?.thumb

  return (await database.get('images', id))?.thumb
}

export async function listImagesForEntry(
  entryId: string,
): Promise<ImageRecord[]> {
  const database = await openDb()
  const images = database
    ? await database.getAllFromIndex('images', 'by-entry', entryId)
    : Array.from(memoryImages.values())
        .filter((image) => image.entryId === entryId)
        .map(cloneImage)

  return images.sort((left, right) => left.order - right.order)
}

export async function findByUrl(
  url: string | undefined,
): Promise<Entry | undefined> {
  if (!url) return undefined

  const database = await openDb()
  if (!database) {
    const entry = Array.from(memoryEntries.values()).find(
      (candidate) => candidate.url === url,
    )
    return entry ? cloneEntry(entry) : undefined
  }

  return database.getFromIndex('entries', 'by-url', url)
}

async function writeBatch(
  batch: ImportEntry[],
  replace: boolean,
): Promise<void> {
  for (const item of batch) {
    assertImagesBelongToEntry(item.entry, item.images)
  }

  const database = await openDb()
  if (!database) {
    applyMemoryBatch(batch, replace)
    emitChange()
    return
  }

  const transaction = database.transaction(['entries', 'images'], 'readwrite')

  try {
    const entryStore = transaction.objectStore('entries')
    const imageStore = transaction.objectStore('images')

    if (replace) {
      await entryStore.clear()
      await imageStore.clear()
    }

    for (const item of batch) {
      await entryStore.add(item.entry)
      for (const image of item.images) {
        await imageStore.add(image)
      }
    }

    await transaction.done
  } catch (error) {
    return abortAndRethrow(transaction, error)
  }

  emitChange()
}

export function importEntries(batch: ImportEntry[]): Promise<void> {
  return writeBatch(batch, false)
}

export function replaceAll(batch: ImportEntry[]): Promise<void> {
  return writeBatch(batch, true)
}

export async function __resetDatabaseForTests(
  options: { forceInMemory?: boolean } = {},
): Promise<void> {
  const pendingDatabase = databasePromise
  databasePromise = null

  const database = await pendingDatabase?.catch(() => null)
  database?.close()

  memoryEntries.clear()
  memoryImages.clear()
  updateQueues.clear()
  inMemory = options.forceInMemory ?? false
  fallbackReason = inMemory ? 'unavailable' : 'none'

  if (typeof indexedDB !== 'undefined') {
    await deleteDB(DATABASE_NAME)
  }
}
