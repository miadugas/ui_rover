import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDatabaseForTests, createEntry, getEntry } from '../../../lib/db'
import type { EntryPatch } from '../../../lib/db'
import type { Entry, ExtractResult, ImageRecord, RoleMap } from '../../../types'
import { ExtractionError } from '../extract'
import { MockPanel } from './MockPanel'

const extractMock = vi.hoisted(() => vi.fn())

vi.mock('../extract', () => ({
  extract: extractMock,
  ExtractionError: class ExtractionError extends Error {},
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

function deferredExtraction() {
  let resolve!: (result: ExtractResult) => void
  const promise = new Promise<ExtractResult>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
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
  extractMock.mockReset()
  updateEntryMock.mockReset()
  updateEntryMock.mockImplementation((id: string, patch: EntryPatch) =>
    realDb.updateEntry(id, patch),
  )
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  await __resetDatabaseForTests()
})

describe('MockPanel re-extraction', () => {
  it('persists the extraction and drops a palette edit that is still pending', async () => {
    const extraction = deferredExtraction()
    extractMock.mockReturnValue(extraction.promise)

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
      extraction.resolve({
        colors: EXTRACTED_COLORS,
        roleMap: EXTRACTED_ROLE_MAP,
        degraded: false,
      })
      await vi.runAllTimersAsync()
    })

    const stored = await getEntry(entry.id)
    expect(stored?.colors).toEqual(EXTRACTED_COLORS)
    expect(stored?.roleMap).toEqual(EXTRACTED_ROLE_MAP)
    expect(stored?.blockOverrides).toEqual({})
    expect(stored?.sourceImageId).toBe('design-1-alt')
  })

  it('keeps a pending palette edit and reports the failure when extraction rejects', async () => {
    extractMock.mockRejectedValue(new ExtractionError())

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
