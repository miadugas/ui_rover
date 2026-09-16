# ui_rover v0.1.0 — one persistence owner per field group

TL;DR: every field group in an entry has exactly one component that owns its optimistic draft and its debounced write; nothing else touches those keys.

## The problem

- Debounce loses edits: navigate away inside the 300 ms window and the timer never fires — the write silently drops.
- Two writers race: if two components debounce-patch overlapping keys, whichever flush lands last wins, discarding the other's edit.
- Failed writes vanish: a rejected `updateEntry` with no retention just loses the user's change with no way back.
- In-flight writes resurrect stale state: a write that started before a replace-in-place (re-extraction) can resolve *after* it and stomp the replacement.

## The shape

`src/lib/useDebouncedPatch.ts`, trimmed:

```ts
const pendingPatchRef = useRef<EntryPatch | null>(null)
const generationRef = useRef(0)

const flush = useCallback((): Promise<void> => {
  clearTimer()
  const pendingPatch = pendingPatchRef.current
  if (!pendingPatch) return Promise.resolve()

  const flushGeneration = generationRef.current // snapshot before await
  pendingPatchRef.current = null
  setIsDirty(false)

  return updateEntry(entryId, pendingPatch).then(
    () => {
      if (generationRef.current !== flushGeneration) return // superseded, ignore
      setError(null)
    },
    (cause) => {
      if (generationRef.current !== flushGeneration) return
      // put it back under anything queued since — never overwrite newer edits
      pendingPatchRef.current = { ...pendingPatch, ...pendingPatchRef.current }
      setIsDirty(true)
      setError(toError(cause))
    },
  )
}, [clearTimer, entryId])

const discard = useCallback(() => {
  generationRef.current += 1 // disowns any write already in flight
  clearTimer()
  pendingPatchRef.current = null
  setIsDirty(false)
  setError(null)
}, [clearTimer])

const queue = useCallback((patch: EntryPatch) => {
  pendingPatchRef.current = { ...pendingPatchRef.current, ...patch } // merge, not replace
  setIsDirty(true)
  clearTimer()
  timerRef.current = window.setTimeout(() => { timerRef.current = null; void flush() }, delayMs)
}, [clearTimer, delayMs, flush])
```

## Ownership map

| Field group | Owner | Write mode |
|---|---|---|
| `colors` / `roleMap` / `blockOverrides` | `MockPanel` | debounced (own `useDebouncedPatch` instance) |
| `tags` / `note` | `EntryPage` (`EntryView`) | debounced (separate instance, disjoint keys) |
| `mockTemplate` | `MockPanel` | immediate `updateEntry`, no retry UI on failure (swallowed) |
| create / delete | `CaptureCard` / `EntryPage` | transactional (`createEntry` / `deleteEntry`, one IDB transaction) |

Two `useDebouncedPatch` instances coexist on the same entry (`MockPanel` and `EntryView`) only because their key sets never overlap. That's the whole rule — same keys, same owner.

## The race that forced the generation counter

Timeline for re-extracting a palette while an old edit is mid-flush:

1. User tweaks a swatch → `queue()` merges into `pendingPatchRef`, 300 ms timer starts.
2. Timer fires → `flush()` snapshots the patch, calls `updateEntry`, write is in flight.
3. User hits "extract palette" before the write resolves.
4. `extractInto` calls `discard()` — clears the pending ref, but the in-flight promise from step 2 already closed over its own `pendingPatch` and `flushGeneration`.
5. `extractInto` queues the extracted colors and awaits its own `flush()`.
6. The old write's promise settles (resolve or reject) *after* discard.
7. Without a guard, the reject branch would splice the stale patch back into `pendingPatchRef`, resurrecting colors the user just replaced.
8. Fix: `discard()` bumps `generationRef`; both `then` branches check `generationRef.current !== flushGeneration` and bail. One-liner, no promise cancellation needed.

## Testing it

Fake timers + a deferred promise let you park a write mid-flight and fire `discard()` underneath it (`src/lib/useDebouncedPatch.test.ts`):

```ts
function deferredWrite() {
  let resolve!: () => void
  let reject!: (cause: Error) => void
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

it('ignores a rejected write that discard superseded while it was in flight', async () => {
  vi.useFakeTimers()
  const deferred = deferredWrite()
  vi.mocked(updateEntry).mockReturnValueOnce(deferred.promise)

  const { result } = renderHook(() => useDebouncedPatch('entry-5', 300))
  act(() => { result.current.queue({ note: 'superseded' }) })
  await act(async () => { await vi.advanceTimersByTimeAsync(300) }) // flush in flight

  act(() => { result.current.discard() })
  await act(async () => {
    deferred.reject(new Error('write failed'))
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(result.current.isDirty).toBe(false)
  expect(result.current.error).toBeNull() // stale rejection had no effect
})
```

Mutation check: delete the `discard()` call's `generationRef.current += 1` line and this test fails — `isDirty`/`error` flip back on from the stale reject.

A second lesson lives in `spec.ts`: `renderKey` is per-frame and unique (`ecommerce.mobile.hero.cta`) — it's React's identity key. `overrideKey` is template-scoped and deliberately shared across the web/mobile variants of the same element (`ecommerce.hero.cta`), so one override in `blockOverrides` paints both frames. Identity keys don't merge; override keys are meant to.

## Performance notes

- 300 ms sits above human typing-pause latency but below "feels unsaved" — tuned to keystroke bursts (swatch drags, tag typing), not network RTT.
- Flush fires on `visibilitychange → hidden`, not `beforeunload`: `beforeunload` is unreliable for async work (many browsers won't await it, mobile Safari often skips it on tab close), while `visibilitychange` fires reliably on tab switch/backgrounding and still leaves time for the write. `beforeunload` is only used to show the native "unsaved changes" prompt, not to flush.
- Serialization is per-entry (`updateQueues: Map<string, Promise<void>>` in `db.ts`), not a single global queue — edits to different entries never block each other, and each entry's read-modify-write stays atomic without serializing unrelated IDB transactions.

## Why this shape

A single mutable draft with two writers is a distributed-systems problem wearing a React costume: without one owner per key set you need either locking or CRDT-style merge to resolve concurrent writers, and this app needs neither because the keys just don't overlap. Partitioning ownership by field group turns "avoid a race" into "there is no race" — cheaper than any conflict-resolution scheme, at the cost of discipline: every new field has to be assigned an owner before it's added anywhere.

## See also

- TanStack Query — optimistic updates via `onMutate`/`mutationKey`, the mainstream version of "draft now, reconcile on settle."
- Linear's sync engine (their engineering blog covers the local-first optimistic-mutation model) — same generation/version-stamp idea at app scale.
- Figma's multiplayer model — last-writer-wins per property, the same "own it at field granularity" idea pushed to a live CRDT.
- Automerge / Yjs — the heavier alternative when you need merge instead of ownership (multi-user concurrent edits on the *same* field).
