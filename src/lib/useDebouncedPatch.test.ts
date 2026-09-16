import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateEntry } from './db'
import { useDebouncedPatch } from './useDebouncedPatch'

vi.mock('./db', () => ({
  updateEntry: vi.fn(() => Promise.resolve()),
}))

function deferredWrite() {
  let resolve!: () => void
  let reject!: (cause: Error) => void
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle
    reject = fail
  })

  return { promise, resolve, reject }
}

describe('useDebouncedPatch', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('flushes the merged pending patch on unmount', () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() =>
      useDebouncedPatch('entry-1', 300),
    )

    act(() => {
      result.current.queue({ note: 'draft' })
      result.current.queue({ tags: ['reference'] })
    })

    expect(result.current.isDirty).toBe(true)

    act(() => unmount())
    act(() => vi.runAllTimers())

    expect(vi.mocked(updateEntry)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updateEntry)).toHaveBeenCalledWith('entry-1', {
      note: 'draft',
      tags: ['reference'],
    })
  })

  it('drops the pending patch without writing when it is discarded', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDebouncedPatch('entry-4', 300))

    act(() => {
      result.current.queue({ note: 'superseded' })
    })

    expect(result.current.isDirty).toBe(true)

    act(() => {
      result.current.discard()
    })

    act(() => vi.runAllTimers())

    expect(vi.mocked(updateEntry)).not.toHaveBeenCalled()
    expect(result.current.isDirty).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('keeps the pending patch and reports the failure when a write rejects', async () => {
    vi.useFakeTimers()
    vi.mocked(updateEntry).mockRejectedValueOnce(new Error('write failed'))

    const { result } = renderHook(() => useDebouncedPatch('entry-2', 300))

    act(() => {
      result.current.queue({ note: 'first', tags: ['reference'] })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(result.current.isDirty).toBe(true)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(vi.mocked(updateEntry)).toHaveBeenCalledTimes(1)
  })

  it('writes the merged patch and clears the error when retry succeeds', async () => {
    vi.useFakeTimers()
    vi.mocked(updateEntry).mockRejectedValueOnce(new Error('write failed'))

    const { result } = renderHook(() => useDebouncedPatch('entry-3', 300))

    act(() => {
      result.current.queue({ note: 'first', tags: ['reference'] })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    act(() => {
      result.current.queue({ note: 'second' })
    })

    await act(async () => {
      await result.current.retry()
    })

    expect(vi.mocked(updateEntry)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(updateEntry)).toHaveBeenLastCalledWith('entry-3', {
      note: 'second',
      tags: ['reference'],
    })
    expect(result.current.isDirty).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('ignores a rejected write that discard superseded while it was in flight', async () => {
    vi.useFakeTimers()
    const deferred = deferredWrite()
    vi.mocked(updateEntry).mockReturnValueOnce(deferred.promise)

    const { result } = renderHook(() => useDebouncedPatch('entry-5', 300))

    act(() => {
      result.current.queue({ note: 'superseded' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(vi.mocked(updateEntry)).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.discard()
    })

    await act(async () => {
      deferred.reject(new Error('write failed'))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.isDirty).toBe(false)
    expect(result.current.error).toBeNull()

    await act(async () => {
      await result.current.flush()
    })

    expect(vi.mocked(updateEntry)).toHaveBeenCalledTimes(1)
  })

  it('ignores a resolved write that discard superseded while it was in flight', async () => {
    vi.useFakeTimers()
    const deferred = deferredWrite()
    vi.mocked(updateEntry).mockReturnValueOnce(deferred.promise)

    const { result } = renderHook(() => useDebouncedPatch('entry-6', 300))

    act(() => {
      result.current.queue({ note: 'superseded' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    act(() => {
      result.current.discard()
    })

    await act(async () => {
      deferred.resolve()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.isDirty).toBe(false)
    expect(result.current.error).toBeNull()

    await act(async () => {
      await result.current.flush()
    })

    expect(vi.mocked(updateEntry)).toHaveBeenCalledTimes(1)
  })
})
