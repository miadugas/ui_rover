import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImageIntake } from './useImageIntake'

vi.mock('./imageMeta', () => ({
  readImageMeta: vi.fn(() => Promise.resolve({ width: 1200, height: 800 })),
  makeThumb: vi.fn(() => Promise.resolve(new Blob(['thumb'], { type: 'image/webp' }))),
}))

let nextObjectUrlId = 0
const revokeSpy = vi.fn()

beforeEach(() => {
  nextObjectUrlId = 0
  revokeSpy.mockClear()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test/${++nextObjectUrlId}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeSpy)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function imageFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
}

function dispatchPaste(clipboardData: unknown) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: clipboardData })
  document.dispatchEvent(event)
}

describe('useImageIntake', () => {
  it('adds files in order with metadata, a thumb and an object URL', async () => {
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      await result.current.add([imageFile('one.png'), imageFile('two.png')])
    })

    expect(result.current.images).toHaveLength(2)
    expect(result.current.images.map((image) => (image.blob as File).name)).toEqual([
      'one.png',
      'two.png',
    ])
    expect(result.current.images[0].objectUrl).toBe('blob:test/1')
    expect(result.current.images[0]).toMatchObject({ width: 1200, height: 800, mime: 'image/png' })
    expect(result.current.images[0].thumb.size).toBeGreaterThan(0)
    expect(result.current.rejections).toEqual([])
  })

  it('moves an image down and back up', async () => {
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      await result.current.add([imageFile('one.png'), imageFile('two.png')])
    })
    const firstId = result.current.images[0].tempId

    act(() => result.current.move(firstId, 'down'))
    expect(result.current.images.map((image) => image.tempId)[1]).toBe(firstId)

    act(() => result.current.move(firstId, 'up'))
    expect(result.current.images.map((image) => image.tempId)[0]).toBe(firstId)
  })

  it('ignores a move past either end', async () => {
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      await result.current.add([imageFile('one.png'), imageFile('two.png')])
    })
    const before = result.current.images.map((image) => image.tempId)

    act(() => result.current.move(before[0], 'up'))
    act(() => result.current.move(before[1], 'down'))

    expect(result.current.images.map((image) => image.tempId)).toEqual(before)
  })

  it('revokes only the removed image URL', async () => {
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      await result.current.add([imageFile('one.png'), imageFile('two.png')])
    })
    const [first, second] = result.current.images

    act(() => result.current.remove(first.tempId))

    expect(revokeSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith(first.objectUrl)
    expect(result.current.images.map((image) => image.tempId)).toEqual([second.tempId])
  })

  it('revokes every URL on clear', async () => {
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      await result.current.add([imageFile('one.png'), imageFile('two.png')])
    })
    const urls = result.current.images.map((image) => image.objectUrl)

    act(() => result.current.clear())

    expect(result.current.images).toEqual([])
    expect(revokeSpy.mock.calls.flat()).toEqual(urls)
  })

  it('revokes remaining URLs on unmount', async () => {
    const { result, unmount } = renderHook(() => useImageIntake())

    await act(async () => {
      await result.current.add([imageFile('one.png')])
    })
    const url = result.current.images[0].objectUrl

    unmount()

    expect(revokeSpy).toHaveBeenCalledWith(url)
  })

  it('adds an image pasted from the clipboard', async () => {
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      dispatchPaste({ files: [imageFile('pasted.png')], items: [] })
    })

    expect(result.current.images).toHaveLength(1)
    expect((result.current.images[0].blob as File).name).toBe('pasted.png')
  })

  it('reads an image out of clipboard items when files is empty', async () => {
    const file = imageFile('from-item.png')
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      dispatchPaste({
        files: [],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      })
    })

    expect(result.current.images).toHaveLength(1)
    expect((result.current.images[0].blob as File).name).toBe('from-item.png')
  })

  it('records a not-image rejection for a text-only paste', async () => {
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      dispatchPaste({
        files: [],
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
      })
    })

    expect(result.current.images).toEqual([])
    expect(result.current.rejections.map((rejection) => rejection.reason)).toEqual(['not-image'])

    act(() => result.current.dismissRejections())
    expect(result.current.rejections).toEqual([])
  })

  it('ignores a text paste that lands in the URL field', async () => {
    const urlInput = document.createElement('input')
    document.body.appendChild(urlInput)
    const { result } = renderHook(() => useImageIntake())

    await act(async () => {
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          files: [],
          items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        },
      })
      urlInput.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    })

    expect(result.current.images).toEqual([])
    expect(result.current.rejections).toEqual([])
    urlInput.remove()
  })

  it('ignores pastes while disabled', async () => {
    const { result } = renderHook(() => useImageIntake({ enabled: false }))

    await act(async () => {
      dispatchPaste({ files: [imageFile('pasted.png')], items: [] })
    })

    expect(result.current.images).toEqual([])
    expect(result.current.rejections).toEqual([])
  })
})
