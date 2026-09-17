import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDatabaseForTests, createEntry, getEntry } from '../lib/db'
import type { Entry, ImageRecord, RoleMap } from '../types'
import type { ReadResult } from '../features/palette/read/readPalette'
import { ReadCancelledError } from '../features/palette/read/readProgress'
import { EntryPage } from './EntryPage'

const readPaletteMock = vi.hoisted(() => vi.fn())

// Mocking the orchestrator keeps Tesseract, its worker and the Canvas crop out
// of jsdom; every read on this page goes through it.
vi.mock('../features/palette/read/readPalette', () => ({
  readPalette: readPaletteMock,
}))

vi.mock('../features/palette/read/ocrWorker', () => ({
  recognizeWords: vi.fn(),
  releaseWorkerSoon: vi.fn(),
}))

const deleteEntryMock = vi.hoisted(() => vi.fn())

// Only `deleteEntry` is faked, and by default it still deletes: every other test
// here asserts against the real store. The real implementation is parked on a
// hoisted holder because the factory runs before module-level bindings exist.
const realDb = vi.hoisted(() => ({
  deleteEntry: undefined as unknown as (id: string) => Promise<void>,
}))

vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  realDb.deleteEntry = actual.deleteEntry

  return { ...actual, deleteEntry: deleteEntryMock }
})

const ROLE_MAP: RoleMap = {
  background: '#ffffff',
  surface: '#eeeeee',
  text: '#111111',
  muted: '#888888',
  primary: '#2244ff',
  accent: '#ff4422',
}

const COLORS = ['#ffffff', '#2244ff', '#111111']

function readResult(overrides: Partial<ReadResult> = {}): ReadResult {
  return {
    colors: COLORS,
    roleMap: ROLE_MAP,
    degraded: false,
    source: 'ocr',
    candidates: COLORS.map((hex) => ({
      hex,
      source: 'ocr' as const,
      confidence: 92,
    })),
    ...overrides,
  }
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

function entryFixture(overrides: Partial<Entry> = {}): Entry {
  const id = overrides.id ?? 'entry-1'

  return {
    id,
    url: `https://instagram.com/p/${id}`,
    platform: 'instagram',
    shortcode: id,
    kind: 'palette',
    images: [{ id: `${id}-img`, order: 0, width: 1080, height: 1350, mime: 'image/png' }],
    sourceImageId: `${id}-img`,
    colors: COLORS,
    roleMap: ROLE_MAP,
    mockTemplate: 'ecommerce',
    tags: [],
    note: '',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

async function seed(entry: Entry): Promise<void> {
  await createEntry(entry, [imageRecord(entry.id, entry.images[0].id)])
}

interface RouterHandoff {
  notice?: string
  focusHeading?: boolean
  pendingRead?: ReadResult
}

function renderEntry(id: string, state?: RouterHandoff) {
  render(
    <MemoryRouter initialEntries={[{ pathname: `/entry/${id}`, state }]}>
      <Routes>
        <Route path="/entry/:id" element={<EntryPage />} />
        <Route path="/library" element={<h1>Library</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await __resetDatabaseForTests()
  readPaletteMock.mockReset()
  deleteEntryMock.mockReset()
  deleteEntryMock.mockImplementation((id: string) => realDb.deleteEntry(id))
})

afterEach(cleanup)

describe('EntryPage', () => {
  it('shows a not-found message with a way back for an unknown id', async () => {
    renderEntry('nope')

    expect(await screen.findByRole('heading', { name: 'Entry not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the library' })).toBeInTheDocument()
  })

  it('renders a palette entry with its swatches and mock blocks', async () => {
    await seed(entryFixture())
    renderEntry('entry-1')

    expect(await screen.findByRole('button', { name: 'Copy #2244ff' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy #111111' })).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Hero shop now, primary, #2244ff' }).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Open original post' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
  })

  it('extracts and persists a palette for a design entry', async () => {
    const user = userEvent.setup()
    readPaletteMock.mockResolvedValue(readResult())
    await seed(
      entryFixture({
        id: 'entry-2',
        kind: 'design',
        colors: undefined,
        roleMap: undefined,
        sourceImageId: undefined,
        mockTemplate: undefined,
      }),
    )
    renderEntry('entry-2')

    const extractButton = await screen.findByRole('button', { name: 'Extract palette' })
    await waitFor(() => expect(extractButton).toBeEnabled())
    await user.click(extractButton)

    await waitFor(async () => {
      const stored = await getEntry('entry-2')
      expect(stored?.colors).toEqual(COLORS)
      expect(stored?.roleMap).toEqual(ROLE_MAP)
      expect(stored?.kind).toBe('design')
      expect(stored?.sourceImageId).toBe('entry-2-img')
    })

    expect(readPaletteMock).toHaveBeenCalledTimes(1)
    // The blob comes back through fake-indexeddb, so it is not the jsdom realm's
    // `Blob` and `expect.any(Blob)` would miss it.
    expect(readPaletteMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceImageId: 'entry-2-img',
        signal: expect.any(AbortSignal),
      }),
    )
    expect((await getEntry('entry-2'))?.paletteSource).toBe('ocr')
    expect(
      await screen.findByText('Read 3 hex codes from the card'),
    ).toBeInTheDocument()
  })

  it('reports an unreadable image instead of writing colors', async () => {
    const user = userEvent.setup()
    readPaletteMock.mockRejectedValue(new Error('no colors'))
    await seed(
      entryFixture({
        id: 'entry-3',
        kind: 'design',
        colors: undefined,
        roleMap: undefined,
        sourceImageId: undefined,
      }),
    )
    renderEntry('entry-3')

    const extractButton = await screen.findByRole('button', { name: 'Extract palette' })
    await waitFor(() => expect(extractButton).toBeEnabled())
    await user.click(extractButton)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't read colors from that image",
    )
    expect((await getEntry('entry-3'))?.colors).toBeUndefined()
  })

  it('shows a notice handed over in router state and clears it on dismiss', async () => {
    const user = userEvent.setup()
    await seed(entryFixture({ id: 'entry-5' }))
    renderEntry('entry-5', { notice: 'saved as a design' })

    expect(await screen.findByText('saved as a design')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() =>
      expect(screen.queryByText('saved as a design')).not.toBeInTheDocument(),
    )
  })

  it('re-extracts a design palette from another selected image', async () => {
    const user = userEvent.setup()
    readPaletteMock.mockResolvedValue(readResult())

    const entry = entryFixture({
      id: 'entry-6',
      kind: 'design',
      images: [
        { id: 'entry-6-img', order: 0, width: 1080, height: 1350, mime: 'image/png' },
        { id: 'entry-6-alt', order: 1, width: 1080, height: 1350, mime: 'image/png' },
      ],
      blockOverrides: { 'hero.cta': '#123456' },
    })
    await createEntry(entry, [
      imageRecord('entry-6', 'entry-6-img'),
      imageRecord('entry-6', 'entry-6-alt'),
    ])
    renderEntry('entry-6')

    const extractButton = await screen.findByRole('button', {
      name: 'Extract palette from this image',
    })

    await user.click(screen.getAllByRole('tab')[1])
    await waitFor(() => expect(extractButton).toBeEnabled())
    await user.click(extractButton)

    await waitFor(async () => {
      const stored = await getEntry('entry-6')
      expect(stored?.sourceImageId).toBe('entry-6-alt')
      expect(stored?.blockOverrides).toEqual({})
    })
  })

  it('deletes the entry only after the inline confirm', async () => {
    const user = userEvent.setup()
    await seed(entryFixture({ id: 'entry-4' }))
    renderEntry('entry-4')

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(
      screen.getByText('Delete this entry? This cannot be undone.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await getEntry('entry-4')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(async () => {
      expect(await getEntry('entry-4')).toBeUndefined()
    })
  })

  it('keeps the entry and reports a failed delete instead of navigating', async () => {
    const user = userEvent.setup()
    await seed(entryFixture({ id: 'entry-7' }))
    renderEntry('entry-7')

    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    deleteEntryMock.mockRejectedValueOnce(new Error('delete failed'))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't delete this entry — try again",
    )
    expect(screen.getByRole('heading', { name: 'entry-7' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument()
    expect(await getEntry('entry-7')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument()
  })

  it('focuses the entry heading when the route was entered from a save', async () => {
    await seed(entryFixture({ id: 'entry-8' }))
    renderEntry('entry-8', { focusHeading: true })

    const heading = await screen.findByRole('heading', { name: 'entry-8' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })

  it('leaves focus alone on an ordinary visit', async () => {
    await seed(entryFixture({ id: 'entry-9' }))
    renderEntry('entry-9')

    await screen.findByRole('heading', { name: 'entry-9' })
    expect(document.activeElement).toBe(document.body)
  })

  it('opens the handed-over review once and clears it from the history', async () => {
    const user = userEvent.setup()
    await seed(entryFixture({ id: 'entry-10' }))
    renderEntry('entry-10', { focusHeading: true, pendingRead: readResult() })

    expect(
      await screen.findByText('Read 3 hex codes from the card'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(
        screen.queryByText('Read 3 hex codes from the card'),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Read palette' })).toBeInTheDocument()
  })

  it('leaves a design entry untouched when the first read is cancelled', async () => {
    const user = userEvent.setup()
    readPaletteMock.mockRejectedValue(new ReadCancelledError())
    await seed(
      entryFixture({
        id: 'entry-11',
        kind: 'design',
        colors: undefined,
        roleMap: undefined,
        sourceImageId: undefined,
        mockTemplate: undefined,
      }),
    )
    renderEntry('entry-11')

    const extractButton = await screen.findByRole('button', { name: 'Extract palette' })
    await waitFor(() => expect(extractButton).toBeEnabled())
    await user.click(extractButton)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Extract palette' })).toBeEnabled(),
    )
    const stored = await getEntry('entry-11')
    expect(stored?.colors).toBeUndefined()
    expect(stored?.paletteSource).toBeUndefined()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
