import { useCallback, useEffect, useRef, useState } from 'react'
import { updateEntry } from './db'
import type { EntryPatch } from './db'

export interface DebouncedPatch {
  queue: (patch: EntryPatch) => void
  flush: () => Promise<void>
  retry: () => Promise<void>
  discard: () => void
  isDirty: boolean
  error: Error | null
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

export function useDebouncedPatch(
  entryId: string,
  delayMs = 300,
): DebouncedPatch {
  const pendingPatchRef = useRef<EntryPatch | null>(null)
  const timerRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return

    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  // The patch is only dropped once the write lands. A rejected write puts it
  // back underneath anything queued in the meantime, so a failed autosave costs
  // the user nothing but a Retry click. A write whose generation has moved on
  // was disowned by `discard` while it was in flight, so neither outcome may
  // touch state the caller has already replaced.
  const flush = useCallback((): Promise<void> => {
    clearTimer()

    const pendingPatch = pendingPatchRef.current
    if (!pendingPatch) return Promise.resolve()

    const flushGeneration = generationRef.current
    pendingPatchRef.current = null
    setIsDirty(false)

    return updateEntry(entryId, pendingPatch).then(
      () => {
        if (generationRef.current !== flushGeneration) return
        setError(null)
      },
      (cause: unknown) => {
        if (generationRef.current !== flushGeneration) return

        pendingPatchRef.current = { ...pendingPatch, ...pendingPatchRef.current }
        setIsDirty(true)
        setError(toError(cause))
      },
    )
  }, [clearTimer, entryId])

  // Callers that are about to replace the same fields wholesale (re-extraction)
  // drop the draft first, so a late autosave cannot restore what they replaced.
  const discard = useCallback(() => {
    generationRef.current += 1
    clearTimer()
    pendingPatchRef.current = null
    setIsDirty(false)
    setError(null)
  }, [clearTimer])

  const queue = useCallback(
    (patch: EntryPatch) => {
      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        ...patch,
      }
      setIsDirty(true)
      clearTimer()

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void flush()
      }, delayMs)
    },
    [clearTimer, delayMs, flush],
  )

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      void flush()
    }

    const handlePageHide = () => {
      void flush()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [flush])

  useEffect(() => {
    if (!isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(
    () => () => {
      void flush()
    },
    [flush],
  )

  return { queue, flush, retry: flush, discard, isDirty, error }
}
