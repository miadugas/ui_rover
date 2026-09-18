# Derive, don't nest: child records with provenance

**TL;DR** — A captured component is its *own* entry that remembers where it came from (`parentId`, `parentImageId`, `sourceRect`). That costs three integrity rules (create, delete, import) and one index — and buys back every list, filter, thumbnail, export and palette path for free.

## The decision

- **Nested `components[]` on the parent**: one write, no orphans — but the grid, filters, thumbs-on-intersection, export, palette read and delete each grow a "…and also walk the children" branch.
- **Own entries**: every existing surface already works on `Entry`. Price: two integrity rules + one index + import ordering.
- The crop is **materialized** as its own image (`images[0]`, WebP), not stored as "parent + rect". Every consumer of `images[]` just works, and the component survives edits to the parent.
- One level only: a component can never be a parent. Cascade depth stays 1, forever.

## Provenance fields

```ts
interface Entry {
  id: string
  url?: string; platform?: Platform; shortcode?: string   // optional since v0.3.0 — id is identity
  kind: 'palette' | 'design' | 'component'
  images: ImageRef[]
  sourceImageId?: string        // ALWAYS one of this entry's own images
  parentId?: string             // provenance: which post
  parentImageId?: string        // provenance: which screenshot of that post
  sourceRect?: NormalizedRect   // provenance: where on it (0–1)
  componentTags?: ComponentTag[]
}
```

**The trap we avoided:** the first draft reused `sourceImageId` to mean "the parent's image". But `MockPanel` and `readPalette` *write* `sourceImageId` on every palette read. The first "Extract palette" on a component would have silently overwritten its parent pointer and orphaned `sourceRect`. Rule of thumb: **a field another subsystem writes cannot double as a pointer.**

## Rule 1 — create: validate inside the transaction

```ts
// db.ts — assertCreateEntryRelationships(entry, images, parent); `parent` is read in the same readwrite tx
if (entry.kind !== 'component') {
  if (entry.parentId !== undefined) throw dataError('A non-component entry cannot have a parent')
  return
}
if (!entry.parentId || !parent) throw dataError('A component must reference an existing parent')
if (parent.kind === 'component') throw dataError('A component cannot be the parent of another component')
if (!entry.parentImageId || !parent.images.some((image) => image.id === entry.parentImageId)) {
  throw dataError('A component must reference an image on its parent')
}
if (entry.images.length !== 1 || images.length !== 1) throw dataError('A component must have exactly one image')
const imageId = entry.images[0]?.id
if (imageId !== images[0]?.id || entry.sourceImageId !== imageId) {
  throw dataError('A component source image must be its own image')
}
```

Checking *inside* the write transaction closes the window where the parent is deleted between a check and the insert.

## Rule 2 — delete: one-level cascade, keys first

```ts
const childIds = await entryStore.index('by-parent').getAllKeys(id)
for (const childId of childIds) {
  for (const imageId of await imageStore.index('by-entry').getAllKeys(childId)) {
    await imageStore.delete(imageId)
  }
  await entryStore.delete(childId)
}
// …then the parent's images, then the parent — all in ONE readwrite transaction
```

Keys are collected before any delete (no mutating cursor). Any failure aborts the transaction: either the post and all its components vanish, or nothing does.

## Rule 3 — import: resolve twice, write once

```ts
// export.ts — resolveImport (trimmed). Pure: no I/O, fully unit-tested.
// pass 1: collisions. Merge skips by id, or by url when the entry has one; Replace accepts all.
// pass 2: which parents will exist AFTER the operation?
const parentsById = new Map<string, Entry>()
if (mode === 'merge') for (const e of existing) if (e.kind !== 'component') parentsById.set(e.id, e)
for (const item of collisionFree) if (item.entry.kind !== 'component') parentsById.set(item.entry.id, item.entry)

for (const item of collisionFree) {
  if (item.entry.kind !== 'component') { parents.push(item); continue }
  const parent = parentsById.get(item.entry.parentId ?? '')
  const hasImage = parent?.images.some((img) => img.id === item.entry.parentImageId)
  if (!parent || !hasImage) { orphaned += 1; continue }     // never written
  components.push(item)
}
return { accepted: [...parents, ...components], skipped, orphaned }   // parents first
```

| Mode | Parent set for pass 2 | Why |
| --- | --- | --- |
| Merge | existing posts ∪ accepted posts | a parent already in the library counts |
| Replace | accepted posts only | the library is cleared first — old parents don't survive |
| either | a parent skipped for a URL collision is **not** in the set | its components become orphans, counted in the result line |

## Schema evolution without losing the library

```ts
upgrade(database, oldVersion, _newVersion, transaction) {
  upgradeStarted = true
  if (oldVersion < 1) { /* create 'entries' + 'images' + v1 indexes */ }
  if (oldVersion < 2) transaction.objectStore('entries').createIndex('by-parent', 'parentId')
}
```

The v1 `upgrade` created both stores unconditionally. Re-running it at `oldVersion === 1` throws `ConstraintError`; the old catch-all flipped to the in-memory fallback — an **empty library with no explanation**. Now every step is guarded, and `storageFallbackReason()` distinguishes `'unavailable'` from `'upgrade-failed'` so the banner can say "your saved entries are intact but not loaded".

Test seam — build the *old* world first:

```ts
const v1 = await openDB('ui-rover', 1, { upgrade: createV1Schema })
await v1.put('entries', legacyEntry); v1.close()
await openDb()                                   // module under test runs the real upgrade
expect(await listEntries()).toHaveLength(1)      // data survived
expect(await listChildren(legacyEntry.id)).toEqual([])   // new index usable
```

## Optional unique keys

IndexedDB simply does not index a record whose key path is `undefined`, so a `unique` index on `url` tolerates any number of URL-less entries. Our in-memory fallback mirrored the rule wrong — `entry.url === next.url` is `undefined === undefined` — and rejected the second URL-less entry. Parity bugs hide in the fallback you never run.

## Performance notes

- The Components strip and the cascade use the `by-parent` index — no library scan.
- Crops are materialized once at capture (WebP at 0.92, typically tens of KB) instead of re-cropping the parent on every render; grid thumbs stay intersection-gated.
- `resolveImport` is O(n) over the batch with two maps; the single write transaction is unchanged.

## Why this shape

A swipe file is only useful if everything you saved is findable the same way. Making components first-class entries means "things I like" is one collection with one set of tools, and the hierarchy is just metadata. The cost — three small integrity rules — is the same deal a relational schema makes with foreign keys, written by hand because IndexedDB has none.

## See also

- **Notion's block model / Figma's node tree** — every block or node is a first-class record with a parent pointer; hierarchy is data, not nesting.
- **Dexie.js versioned schemas** and MDN's `onupgradeneeded` guide — the canonical version-aware migration pattern for IndexedDB.
- **SQL `ON DELETE CASCADE` and deferred foreign-key checks** — rules 1–3 are exactly what the database would do for you if it could.
