import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetDatabaseForTests,
  createEntry,
  getEntry,
  importEntries,
} from '../lib/db'
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
const getImageBlobMock = vi.hoisted(() => vi.fn())

// These mock seams delegate to the real store unless a test overrides them.
// The implementations are parked on a hoisted holder because the factory runs
// before module-level bindings exist.
const realDb = vi.hoisted(() => ({
  deleteEntry: undefined as unknown as (id: string) => Promise<void>,
  getImageBlob: undefined as unknown as (
    id: string,
  ) => Promise<Blob | undefined>,
}))

vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  realDb.deleteEntry = actual.deleteEntry
  realDb.getImageBlob = actual.getImageBlob

  return {
    ...actual,
    deleteEntry: deleteEntryMock,
    getImageBlob: getImageBlobMock,
  }
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

function componentFixture(
  id: string,
  parentId: string,
  overrides: Partial<Entry> = {},
): Entry {
  return {
    id,
    kind: 'component',
    parentId,
    parentImageId: `${parentId}-img`,
    sourceRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    images: [{ id: `${id}-img`, order: 0, width: 200, height: 100, mime: 'image/webp' }],
    sourceImageId: `${id}-img`,
    componentTags: ['button'],
    tags: [],
    note: '',
    createdAt: 1_700_000_100_000,
    updatedAt: 1_700_000_100_000,
    ...overrides,
  }
}

function designFixture(id: string): Entry {
  return entryFixture({
    id,
    kind: 'design',
    colors: undefined,
    roleMap: undefined,
    sourceImageId: undefined,
    mockTemplate: undefined,
  })
}

async function seedComponentOf(parentId: string, id: string): Promise<void> {
  await seed(designFixture(parentId))
  const component = componentFixture(id, parentId)
  await createEntry(component, [imageRecord(id, component.images[0].id)])
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
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:ui_rover/test')
  readPaletteMock.mockReset()
  deleteEntryMock.mockReset()
  deleteEntryMock.mockImplementation((id: string) => realDb.deleteEntry(id))
  getImageBlobMock.mockReset()
  getImageBlobMock.mockImplementation((id: string) => realDb.getImageBlob(id))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

  it('renders a URL-less entry without a source link or platform badge', async () => {
    await seed(
      entryFixture({
        id: 'entry-12',
        url: undefined,
        platform: undefined,
        shortcode: undefined,
      }),
    )
    renderEntry('entry-12')

    expect(
      await screen.findByRole('heading', { name: 'Untitled capture' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Open original post' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('IG')).not.toBeInTheDocument()
    expect(screen.queryByText('TH')).not.toBeInTheDocument()
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

  it('offers component capture and lists the components of a design', async () => {
    await seedComponentOf('entry-13', 'child-a')
    renderEntry('entry-13')

    expect(
      await screen.findByRole('button', { name: 'Capture component' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Components (1)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'component: button — from entry-13' }),
    ).toHaveAttribute('href', '/entry/child-a')
  })

  it('explains when selected image data is missing', async () => {
    const entry = designFixture('entry-18')
    await seed(entry)
    getImageBlobMock.mockResolvedValue(undefined)
    renderEntry(entry.id)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This screenshot's image data is missing — component capture and palette reads are unavailable for it.",
    )
    expect(
      screen.getByRole('button', { name: 'Capture component' }),
    ).toBeDisabled()
  })

  it('does not report missing image data while it is loading', async () => {
    const entry = designFixture('entry-19')
    await seed(entry)
    let resolveImageBlob: (blob: Blob | undefined) => void = () => undefined
    const pendingImageBlob = new Promise<Blob | undefined>((resolve) => {
      resolveImageBlob = resolve
    })
    getImageBlobMock.mockReturnValue(pendingImageBlob)
    renderEntry(entry.id)

    const captureButton = await screen.findByRole('button', {
      name: 'Capture component',
    })
    expect(captureButton).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await act(async () => {
      resolveImageBlob(undefined)
      await pendingImageBlob
    })
  })

  it('locks the carousel to the image where component capture started', async () => {
    const user = userEvent.setup()
    const entry = designFixture('entry-17')
    entry.images = [
      {
        id: 'entry-17-image-a',
        order: 0,
        width: 1080,
        height: 1350,
        mime: 'image/png',
      },
      {
        id: 'entry-17-image-b',
        order: 1,
        width: 1080,
        height: 1350,
        mime: 'image/png',
      },
    ]
    const imageA = imageRecord(entry.id, entry.images[0].id)
    const imageB = { ...imageRecord(entry.id, entry.images[1].id), order: 1 }
    await createEntry(entry, [imageA, imageB])
    renderEntry(entry.id)

    const captureButton = await screen.findByRole('button', {
      name: 'Capture component',
    })
    await waitFor(() => expect(captureButton).toBeEnabled())
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    await user.click(captureButton)

    for (const tab of tabs) {
      expect(tab).toBeDisabled()
      expect(tab).toHaveAttribute('aria-disabled', 'true')
    }
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('renders a component with its badge, parent link and no capture button', async () => {
    await seedComponentOf('entry-14', 'child-b')
    renderEntry('child-b')

    expect(
      await screen.findByRole('heading', { name: 'Component of entry-14' }),
    ).toBeInTheDocument()
    expect(screen.getByText('COMPONENT')).toBeInTheDocument()
    const parentLink = screen.getByRole('link', { name: 'entry-14' })
    expect(parentLink).toHaveAttribute(
      'href',
      '/entry/entry-14',
    )
    expect(parentLink).toContainElement(screen.getByTestId('parent-thumbnail'))
    await waitFor(() =>
      expect(parentLink.querySelector('img[alt=""]')).not.toBeNull(),
    )
    expect(
      screen.queryByRole('button', { name: 'Capture component' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('persists a component chip edit through the debounced patch', async () => {
    const user = userEvent.setup()
    await seedComponentOf('entry-15', 'child-c')
    renderEntry('child-c')

    const navChip = await screen.findByRole('button', { name: 'Nav' })
    expect(screen.getByRole('button', { name: 'Button' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(navChip)
    expect(navChip).toHaveAttribute('aria-pressed', 'true')

    await waitFor(
      async () => {
        expect((await getEntry('child-c'))?.componentTags).toEqual([
          'button',
          'nav',
        ])
      },
      { timeout: 2000 },
    )
  })

  it('reports a component whose parent is gone', async () => {
    const orphan = componentFixture('child-d', 'entry-16')
    await importEntries([
      { entry: orphan, images: [imageRecord('child-d', orphan.images[0].id)] },
    ])
    renderEntry('child-d')

    expect(
      await screen.findByRole('heading', { name: 'Component' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Parent no longer available')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-thumbnail')).not.toBeInTheDocument()
  })
})
