/**
 * Vitest global setup. Loaded via `test.setupFiles` in vite.config.ts.
 *
 * jsdom implements neither IndexedDB, nor Canvas, nor the image/object-URL
 * helpers this app relies on. Everything below either installs a real
 * implementation (fake-indexeddb) or the smallest stub that lets the code under
 * test run. Stubs are only installed when the property is missing, so a future
 * runtime that grows a real implementation keeps it.
 */
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

type Stubbed = typeof globalThis & {
  createImageBitmap?: (...args: unknown[]) => Promise<ImageBitmap>
}

const g = globalThis as Stubbed

/** jsdom has no `createImageBitmap`; the intake path only reads width/height. */
if (typeof g.createImageBitmap !== 'function') {
  g.createImageBitmap = () =>
    Promise.resolve({
      width: 1,
      height: 1,
      close: () => {},
    } as unknown as ImageBitmap)
}

/** jsdom's URL has no blob-URL registry. Hand out unique, revocable strings. */
if (typeof URL.createObjectURL !== 'function') {
  let nextObjectUrlId = 0
  URL.createObjectURL = () => `blob:ui_rover/${++nextObjectUrlId}`
}

if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {}
}

/**
 * Opt-in 2D canvas stub.
 *
 * Canvas-bound code (`downsample`, `samplePixel`, thumbnail generation) is
 * covered by the manual browser check, not by unit tests — pure helpers take
 * pixel buffers directly. A test that still needs `getContext('2d')` to return
 * *something* calls this in `beforeEach` and gets a context whose `getImageData`
 * returns `fill` repeated over the requested area.
 *
 * Returns a restore function; `vi.restoreAllMocks()` also undoes it.
 */
export function installCanvas2dStub(
  fill: [number, number, number, number] = [0, 0, 0, 255],
): () => void {
  const context = {
    canvas: null as unknown as HTMLCanvasElement,
    drawImage: () => {},
    clearRect: () => {},
    fillRect: () => {},
    getImageData: (_sx: number, _sy: number, sw: number, sh: number) => {
      const data = new Uint8ClampedArray(Math.max(0, sw * sh) * 4)
      for (let idx = 0; idx < data.length; idx += 4) {
        data[idx] = fill[0]
        data[idx + 1] = fill[1]
        data[idx + 2] = fill[2]
        data[idx + 3] = fill[3]
      }
      return { data, width: sw, height: sh, colorSpace: 'srgb' }
    },
  }

  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (this: HTMLCanvasElement, kind: string) {
      if (kind !== '2d') return null
      context.canvas = this
      return context as unknown as CanvasRenderingContext2D
    } as typeof HTMLCanvasElement.prototype.getContext)

  return () => spy.mockRestore()
}
