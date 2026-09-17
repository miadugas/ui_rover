import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDatabaseForTests, createEntry, getEntry } from '../../../lib/db'
import type { EntryPatch } from '../../../lib/db'
import type { Entry, ImageRecord, NormalizedRect, RoleMap } from '../../../types'
import type { ReadResult } from '../read/readPalette'
import { ReadCancelledError } from '../read/readProgress'
import { assignRoles } from '../roles'
import { MockPanel } from './MockPanel'

const readPaletteMock = vi.hoisted(() => vi.fn())

// The orchestrator is the seam: mocking it keeps Tesseract, its worker and the
// Canvas crop out of jsdom entirely, and lets a read be held open mid-flight.
vi.mock('../read/readPalette', () => ({ readPalette: readPaletteMock }))

vi.mock('../read/ocrWorker', () => ({
  recognizeWords: vi.fn(),
  releaseWorkerSoon: vi.fn(),
}))

const updateEntryMock = vi.hoisted(() => vi.fn())

// Only `updateEntry` is faked, and by default it still writes: every other test
// here asserts against the real store. The real implementation is parked on a
// hoisted holder because the factory runs before module-level bindings exist.
const realDb = vi.hoisted(() => ({
  updateEntry: undefined as unknown as (id: string, patch: EntryPatch) => Promise<void>,
}))

vi.mock('../../../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/db')>()
  realDb.updateEntry = actual.updateEntry

  return { ...actual, updateEntry: updateEntryMock }
})

const ROLE_MAP: RoleMap = {
  background: '#ffffff',
  surface: '#eeeeee',
  text: '#111111',
  muted: '#888888',
  primary: '#2244ff',
  accent: '#ff4422',
}

const BASE_COLORS = ['#ffffff', '#2244ff', '#111111']

const ADDED_COLOR = '#abcdef'

const EXTRACTED_COLORS = ['#111111', '#222222', '#333333']

const EXTRACTED_ROLE_MAP: RoleMap = {
  background: '#333333',
  surface: '#222222',
  text: '#111111',
  muted: '#222222',
  primary: '#111111',
  accent: '#333333',
}

function deferredRead() {
  let resolve!: (result: ReadResult) => void
  const promise = new Promise<ReadResult>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}

function readResult(overrides: Partial<ReadResult> = {}): ReadResult {
  return {
    colors: EXTRACTED_COLORS,
    roleMap: EXTRACTED_ROLE_MAP,
    degraded: false,
    source: 'ocr',
    candidates: EXTRACTED_COLORS.map((hex) => ({
      hex,
      source: 'ocr' as const,
      confidence: 95,
    })),
    ...overrides,
  }
}

/**
 * jsdom has no layout, so the crop image's box is mocked: 200x200 element with
 * a 1080x1350 intrinsic contains to a 160x200 content box offset 20px left.
 */
const IMAGE_BOX = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 200,
  bottom: 200,
  width: 200,
  height: 200,
  toJSON: () => ({}),
} as DOMRect

function stubImageLayout() {
  const element = Element.prototype as Element & {
    setPointerCapture: (pointerId: number) => void
    releasePointerCapture: (pointerId: number) => void
  }
  element.setPointerCapture = () => {}
  element.releasePointerCapture = () => {}

  vi.spyOn(HTMLImageElement.prototype, 'getBoundingClientRect').mockReturnValue(
    IMAGE_BOX,
  )
}

/** A persisted crop the drag below starts outside of, so it draws a new rect. */
const PERSISTED_CROP = { imageId: 'design-1-img', x: 0.6, y: 0.6, w: 0.3, h: 0.3 }

/** What `dragNewCrop` traces, in the mocked 160x200 content box. */
const DRAGGED_CROP: NormalizedRect = { x: 0.25, y: 0.2, w: 0.5, h: 0.6 }

function dragNewCrop() {
  const overlay = screen.getByRole('group', { name: 'Crop region' })
  fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 60, clientY: 40 })
  fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 140, clientY: 160 })
  fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 140, clientY: 160 })
}

function expectRect(actual: NormalizedRect | undefined, expected: NormalizedRect) {
  expect(actual).toBeDefined()
  expect(actual?.x).toBeCloseTo(expected.x, 5)
  expect(actual?.y).toBeCloseTo(expected.y, 5)
  expect(actual?.w).toBeCloseTo(expected.w, 5)
  expect(actual?.h).toBeCloseTo(expected.h, 5)
}

function imageRecord(entryId: string, id: string): ImageRecord {
  return {
    id,
    entryId,
    order: 0,
    width: 1080,
    height: 1350,
    mime: 'image/png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    thumb: new Blob([new Uint8Array([4])], { type: 'image/png' }),
  }
}

function designEntry(): Entry {
  return {
    id: 'design-1',
    url: 'https://instagram.com/p/design-1',
    platform: 'instagram',
    shortcode: 'design-1',
    kind: 'design',
    images: [
      { id: 'design-1-img', order: 0, width: 1080, height: 1350, mime: 'image/png' },
      { id: 'design-1-alt', order: 1, width: 1080, height: 1350, mime: 'image/png' },
    ],
    sourceImageId: 'design-1-img',
    colors: BASE_COLORS,
    roleMap: ROLE_MAP,
    blockOverrides: { 'hero.cta': '#123456' },
    mockTemplate: 'ecommerce',
    tags: [],
    note: '',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }
}

beforeEach(async () => {
  await __resetDatabaseForTests({ forceInMemory: true })
  readPaletteMock.mockReset()
  updateEntryMock.mockReset()
  updateEntryMock.mockImplementation((id: string, patch: EntryPatch) =>
    realDb.updateEntry(id, patch),
  )
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await __resetDatabaseForTests()
})

describe('MockPanel re-extraction', () => {
  it('persists the extraction and drops a palette edit that is still pending', async () => {
    const read = deferredRead()
    readPaletteMock.mockReturnValue(read.promise)

    const entry = designEntry()
    const selectedBlob = imageRecord(entry.id, 'design-1-alt').blob
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel
        entry={entry}
        sourceBlob={selectedBlob}
        sourceUrl={null}
        selectedBlob={selectedBlob}
        selectedImageId="design-1-alt"
      />,
    )

    vi.useFakeTimers()

    act(() => {
      fireEvent.change(screen.getByLabelText('Add by hex'), {
        target: { value: ADDED_COLOR },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Extract palette from this image' }),
      )
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect((await getEntry(entry.id))?.colors).toEqual([
      ...BASE_COLORS,
      ADDED_COLOR,
    ])

    await act(async () => {
      read.resolve(readResult())
      await vi.runAllTimersAsync()
    })

    const stored = await getEntry(entry.id)
    expect(stored?.colors).toEqual(EXTRACTED_COLORS)
    expect(stored?.roleMap).toEqual(EXTRACTED_ROLE_MAP)
    expect(stored?.blockOverrides).toEqual({})
    expect(stored?.sourceImageId).toBe('design-1-alt')
    expect(stored?.paletteSource).toBe('ocr')
  })

  it('keeps a pending palette edit and reports the failure when extraction rejects', async () => {
    readPaletteMock.mockRejectedValue(new Error('no colors'))

    const entry = designEntry()
    const selectedBlob = imageRecord(entry.id, 'design-1-alt').blob
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel
        entry={entry}
        sourceBlob={selectedBlob}
        sourceUrl={null}
        selectedBlob={selectedBlob}
        selectedImageId="design-1-alt"
      />,
    )

    vi.useFakeTimers()

    act(() => {
      fireEvent.change(screen.getByLabelText('Add by hex'), {
        target: { value: ADDED_COLOR },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Extract palette from this image' }),
      )
    })

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const stored = await getEntry(entry.id)
    expect(stored?.colors).toEqual([...BASE_COLORS, ADDED_COLOR])
    expect(stored?.sourceImageId).toBe('design-1-img')
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't read colors from that image",
    )
  })
})

describe('MockPanel template selection', () => {
  it('reverts the choice on a failed write and persists it on retry', async () => {
    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(<MockPanel entry={entry} sourceBlob={null} sourceUrl={null} />)

    updateEntryMock.mockRejectedValueOnce(new Error('write failed'))

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Dashboard' }))
    })

    expect(screen.getByRole('radio', { name: 'E-commerce' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Dashboard' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't save the template choice",
    )
    expect((await getEntry(entry.id))?.mockTemplate).toBe('ecommerce')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })

    await waitFor(async () => {
      expect((await getEntry(entry.id))?.mockTemplate).toBe('dashboard')
    })
    expect(screen.getByRole('radio', { name: 'Dashboard' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('MockPanel read review', () => {
  it('opens the review once for a handed-over read and reports it consumed', async () => {
    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])
    const onPendingReadConsumed = vi.fn()
    const pendingRead = readResult()

    const { rerender } = render(
      <MockPanel
        entry={entry}
        sourceBlob={null}
        sourceUrl={null}
        pendingRead={pendingRead}
        onPendingReadConsumed={onPendingReadConsumed}
      />,
    )

    expect(screen.getByText('Read 3 hex codes from the card')).toBeInTheDocument()
    expect(onPendingReadConsumed).toHaveBeenCalledTimes(1)

    rerender(
      <MockPanel
        entry={entry}
        sourceBlob={null}
        sourceUrl={null}
        pendingRead={pendingRead}
        onPendingReadConsumed={onPendingReadConsumed}
      />,
    )

    expect(onPendingReadConsumed).toHaveBeenCalledTimes(1)
  })

  it('notes an unavailable OCR engine on a blob-sourced read', async () => {
    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel
        entry={entry}
        sourceBlob={null}
        sourceUrl={null}
        pendingRead={readResult({
          source: 'blobs',
          ocrUnavailable: true,
          candidates: EXTRACTED_COLORS.map((hex) => ({
            hex,
            source: 'blobs' as const,
            area: 100,
          })),
        })}
      />,
    )

    expect(
      screen.getByText('OCR unavailable — using swatch shapes'),
    ).toBeInTheDocument()
  })

  it('re-assigns roles, clears overrides and records the source on Apply', async () => {
    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel
        entry={entry}
        sourceBlob={null}
        sourceUrl={null}
        pendingRead={readResult()}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply (replace)' }))
    })

    await waitFor(async () => {
      const stored = await getEntry(entry.id)
      expect(stored?.colors).toEqual(EXTRACTED_COLORS)
      expect(stored?.roleMap).toEqual(assignRoles(EXTRACTED_COLORS))
      expect(stored?.blockOverrides).toEqual({})
      expect(stored?.paletteSource).toBe('ocr')
    })
  })

  it('adds swatches and leaves roles and overrides untouched on Append', async () => {
    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel
        entry={entry}
        sourceBlob={null}
        sourceUrl={null}
        pendingRead={readResult()}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Append' }))
    })

    await waitFor(async () => {
      const stored = await getEntry(entry.id)
      expect(stored?.colors).toEqual(['#ffffff', '#2244ff', '#111111', '#222222', '#333333'])
    })

    const stored = await getEntry(entry.id)
    expect(stored?.roleMap).toEqual(ROLE_MAP)
    expect(stored?.blockOverrides).toEqual({ 'hero.cta': '#123456' })
    expect(stored?.paletteSource).toBeUndefined()
  })

  it('applies only the checked candidates', async () => {
    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel
        entry={entry}
        sourceBlob={null}
        sourceUrl={null}
        pendingRead={readResult({
          candidates: [
            { hex: '#111111', source: 'ocr', confidence: 95 },
            { hex: '#222222', source: 'ocr', confidence: 91 },
            { hex: '#333333', source: 'ocr', confidence: 60, repaired: true },
            { hex: '#444444', source: 'blobs', area: 90 },
          ],
        })}
      />,
    )

    expect(screen.getByRole('checkbox', { name: /#111111/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /#333333/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /#444444/ })).not.toBeChecked()

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: /#222222/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: /#444444/ }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply (replace)' }))
    })

    await waitFor(async () => {
      expect((await getEntry(entry.id))?.colors).toEqual(['#111111', '#444444'])
    })
  })
})

describe('MockPanel read control', () => {
  it('passes the stored crop through even when it names another image', async () => {
    readPaletteMock.mockResolvedValue(readResult())

    const staleCrop = { imageId: 'design-1-alt', x: 0.1, y: 0.1, w: 0.5, h: 0.5 }
    const entry = { ...designEntry(), crop: staleCrop }
    const sourceBlob = imageRecord(entry.id, 'design-1-img').blob
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel entry={entry} sourceBlob={sourceBlob} sourceUrl="blob:source" />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read palette' }))
    })

    expect(readPaletteMock).toHaveBeenCalledWith(
      sourceBlob,
      expect.objectContaining({
        sourceImageId: 'design-1-img',
        crop: staleCrop,
      }),
    )
  })

  it('leaves the palette untouched when the read is cancelled', async () => {
    readPaletteMock.mockRejectedValue(new ReadCancelledError())

    const entry = designEntry()
    const sourceBlob = imageRecord(entry.id, 'design-1-img').blob
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(<MockPanel entry={entry} sourceBlob={sourceBlob} sourceUrl={null} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read palette' }))
    })

    const stored = await getEntry(entry.id)
    expect(stored?.colors).toEqual(BASE_COLORS)
    expect(stored?.roleMap).toEqual(ROLE_MAP)
    expect(stored?.blockOverrides).toEqual({ 'hero.cta': '#123456' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read palette' })).toBeInTheDocument()
  })
})

describe('MockPanel crop', () => {
  it('stores a confirmed crop, reverts a failed write and retries it', async () => {
    stubImageLayout()

    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(<MockPanel entry={entry} sourceBlob={null} sourceUrl="blob:source" />)

    fireEvent.click(screen.getByRole('button', { name: 'Crop' }))

    const overlay = screen.getByRole('group', { name: 'Crop region' })
    fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 60, clientY: 40 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 140, clientY: 160 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 140, clientY: 160 })

    updateEntryMock.mockRejectedValueOnce(new Error('write failed'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use crop' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save the crop")
    expect((await getEntry(entry.id))?.crop).toBeUndefined()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })

    const stored = await getEntry(entry.id)
    expect(stored?.crop?.imageId).toBe('design-1-img')
    expectRect(stored?.crop, { x: 0.25, y: 0.2, w: 0.5, h: 0.6 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit crop' })).toBeInTheDocument()
  })

  it('reads with the crop that was just confirmed', async () => {
    stubImageLayout()
    readPaletteMock.mockResolvedValue(readResult())

    const entry = designEntry()
    const sourceBlob = imageRecord(entry.id, 'design-1-img').blob
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel entry={entry} sourceBlob={sourceBlob} sourceUrl="blob:source" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Crop' }))

    const overlay = screen.getByRole('group', { name: 'Crop region' })
    fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 60, clientY: 40 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 140, clientY: 160 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 140, clientY: 160 })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use crop' }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read palette' }))
    })

    const passed = readPaletteMock.mock.calls[0][1].crop
    expect(passed.imageId).toBe('design-1-img')
    expectRect(passed, { x: 0.25, y: 0.2, w: 0.5, h: 0.6 })
  })

  it('opens the editor on the auto-crop she kept', async () => {
    stubImageLayout()

    const autoCrop = { x: 0.1, y: 0.2, w: 0.6, h: 0.5 }
    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel
        entry={entry}
        sourceBlob={null}
        sourceUrl="blob:source"
        pendingRead={readResult({ autoCrop })}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep this crop' }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit crop' }))

    expect(
      screen.getByText('Crop 10% left, 20% top, 60% wide, 50% tall'),
    ).toBeInTheDocument()
  })

  it('stores the auto-crop the read detected when she keeps it', async () => {
    const autoCrop = { x: 0.1, y: 0.2, w: 0.6, h: 0.5 }
    const entry = designEntry()
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel
        entry={entry}
        sourceBlob={null}
        sourceUrl={null}
        pendingRead={readResult({ autoCrop })}
      />,
    )

    expect(screen.getByText('Read from the detected card')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep this crop' }))
    })

    expect((await getEntry(entry.id))?.crop).toEqual({
      imageId: 'design-1-img',
      ...autoCrop,
    })
  })

  it('reads with the persisted crop while a drag is still unconfirmed', async () => {
    stubImageLayout()
    readPaletteMock.mockResolvedValue(readResult())

    const entry = { ...designEntry(), crop: PERSISTED_CROP }
    const sourceBlob = imageRecord(entry.id, 'design-1-img').blob
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel entry={entry} sourceBlob={sourceBlob} sourceUrl="blob:source" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit crop' }))
    dragNewCrop()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read palette' }))
    })

    expect(readPaletteMock.mock.calls[0][1].crop).toEqual(PERSISTED_CROP)
    expect((await getEntry(entry.id))?.crop).toEqual(PERSISTED_CROP)
  })

  it('keeps reading with the persisted crop when the confirmed write fails', async () => {
    stubImageLayout()
    readPaletteMock.mockResolvedValue(readResult())

    const entry = { ...designEntry(), crop: PERSISTED_CROP }
    const sourceBlob = imageRecord(entry.id, 'design-1-img').blob
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(
      <MockPanel entry={entry} sourceBlob={sourceBlob} sourceUrl="blob:source" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit crop' }))
    dragNewCrop()

    updateEntryMock.mockRejectedValueOnce(new Error('write failed'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use crop' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save the crop")
    expect((await getEntry(entry.id))?.crop).toEqual(PERSISTED_CROP)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read palette' }))
    })

    expect(readPaletteMock.mock.calls[0][1].crop).toEqual(PERSISTED_CROP)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })

    const stored = await getEntry(entry.id)
    expect(stored?.crop?.imageId).toBe('design-1-img')
    expectRect(stored?.crop, DRAGGED_CROP)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stores the current source id when an older rect is confirmed', async () => {
    stubImageLayout()

    const entry = { ...designEntry(), crop: PERSISTED_CROP }
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    const { rerender } = render(
      <MockPanel entry={entry} sourceBlob={null} sourceUrl="blob:source" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit crop' }))

    rerender(
      <MockPanel
        entry={{ ...entry, sourceImageId: 'design-1-alt' }}
        sourceBlob={null}
        sourceUrl="blob:source"
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use crop' }))
    })

    const stored = await getEntry(entry.id)
    expect(stored?.crop?.imageId).toBe('design-1-alt')
    expectRect(stored?.crop, PERSISTED_CROP)
  })

  it('drops the crop key entirely when the crop is cleared', async () => {
    stubImageLayout()

    const entry = { ...designEntry(), crop: { imageId: 'design-1-img', x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }
    await createEntry(entry, [
      imageRecord(entry.id, 'design-1-img'),
      imageRecord(entry.id, 'design-1-alt'),
    ])

    render(<MockPanel entry={entry} sourceBlob={null} sourceUrl="blob:source" />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit crop' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear crop' }))
    })

    const stored = await getEntry(entry.id)
    expect(stored).toBeDefined()
    expect(Object.keys(stored as object)).not.toContain('crop')
  })
})
