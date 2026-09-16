import { useCallback, useEffect, useRef, useState } from 'react'
import type { Entry, ImageRecord } from '../types'
import {
  createEntry,
  deleteEntry,
  listEntries,
  subscribe,
  updateEntry,
} from './db'
import type { EntryPatch } from './db'

type LibraryStatus = 'loading' | 'ready' | 'error'

export interface LibraryState {
  entries: Entry[]
  status: LibraryStatus
  error?: Error
  refresh: () => Promise<void>
  add: (entry: Entry, images: ImageRecord[]) => Promise<void>
  update: (id: string, patch: EntryPatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export function useLibrary(): LibraryState {
  const [entries, setEntries] = useState<Entry[]>([])
  const [status, setStatus] = useState<LibraryStatus>('loading')
  const [error, setError] = useState<Error>()
  const mountedRef = useRef(true)

  const loadEntries = useCallback(async (showLoading: boolean) => {
    if (showLoading && mountedRef.current) setStatus('loading')

    try {
      const nextEntries = await listEntries()
      if (!mountedRef.current) return

      setEntries(nextEntries)
      setError(undefined)
      setStatus('ready')
    } catch (loadError) {
      if (!mountedRef.current) return

      setError(toError(loadError))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const unsubscribe = subscribe(() => {
      void loadEntries(false)
    })

    const initialLoadTimer = window.setTimeout(() => {
      void loadEntries(false)
    }, 0)

    return () => {
      mountedRef.current = false
      window.clearTimeout(initialLoadTimer)
      unsubscribe()
    }
  }, [loadEntries])

  const runMutation = useCallback(async (mutation: () => Promise<void>) => {
    try {
      await mutation()
    } catch (mutationError) {
      if (mountedRef.current) {
        setError(toError(mutationError))
        setStatus('error')
      }
      throw mutationError
    }
  }, [])

  const refresh = useCallback(
    () => loadEntries(true),
    [loadEntries],
  )

  const add = useCallback(
    (entry: Entry, images: ImageRecord[]) =>
      runMutation(() => createEntry(entry, images)),
    [runMutation],
  )

  const update = useCallback(
    (id: string, patch: EntryPatch) =>
      runMutation(() => updateEntry(id, patch)),
    [runMutation],
  )

  const remove = useCallback(
    (id: string) => runMutation(() => deleteEntry(id)),
    [runMutation],
  )

  return { entries, status, error, refresh, add, update, remove }
}
