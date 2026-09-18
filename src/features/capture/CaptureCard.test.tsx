import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDatabaseForTests, listEntries } from '../../lib/db'
import { ReadCancelledError } from '../palette/read/readProgress'
import type { ReadResult } from '../palette/read/readPalette'
import type { RoleMap } from '../../types'
import { CaptureCard, EXTRACTION_WARNING } from './CaptureCard'

const ROLE_MAP: RoleMap = {
  background: '#ffffff',
  surface: '#ffffff',
  text: '#000000',
  muted: '#000000',
  primary: '#000000',
  accent: '#000000',
}

const READ_RESULT: ReadResult = {
  colors: ['#101828', '#2f6bff'],
  roleMap: ROLE_MAP,
  degraded: false,
  source: 'ocr',
  candidates: [
    { hex: '#101828', source: 'ocr', confidence: 96 },
    { hex: '#2f6bff', source: 'ocr', confidence: 91 },
  ],
  autoCrop: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 },
}

vi.mock('./imageMeta', () => ({
  readImageMeta: vi.fn(() => Promise.resolve({ width: 1200, height: 800 })),
  makeThumb: vi.fn(() => Promise.resolve(new Blob(['thumb'], { type: 'image/webp' }))),
}))

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

const extractMock = vi.hoisted(() => vi.fn())

vi.mock('../palette/extract', () => ({
  extract: extractMock,
  ExtractionError: class ExtractionError extends Error {},
}))

const readPaletteMock = vi.hoisted(() => vi.fn())

vi.mock('../palette/read/readPalette', () => ({ readPalette: readPaletteMock }))

vi.mock('../palette/read/ocrWorker', () => ({
  recognizeWords: vi.fn(),
  releaseWorkerSoon: vi.fn(),
}))

const findByUrlSpy = vi.hoisted(() => vi.fn())

// Only the duplicate lookup is observed; every other db call stays real so the
// assertions below read the store the component actually wrote to.
vi.mock('../../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/db')>()

  return {
    ...actual,
    findByUrl: (url: string) => {
      findByUrlSpy(url)
      return actual.findByUrl(url)
    },
  }
})

const VALID_IG_URL = 'https://www.instagram.com/p/Cabc123XY/'

function renderCard() {
  const { container } = render(
    <MemoryRouter>
      <CaptureCard />
    </MemoryRouter>,
  )
  return { container }
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Save' })
}

async function addScreenshot(container: HTMLElement) {
  const picker = container.querySelector('input[type="file"]')
  if (!picker) throw new Error('file picker input not found')

  const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
  await act(async () => {
    fireEvent.change(picker, { target: { files: [file] } })
  })
}

beforeEach(async () => {
  await __resetDatabaseForTests()
  extractMock.mockReset()
  readPaletteMock.mockReset()
  navigateMock.mockReset()
  findByUrlSpy.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('CaptureCard', () => {
  it('keeps Save disabled with a valid URL but no image', () => {
    renderCard()

    fireEvent.change(screen.getByLabelText('Post URL (optional)'), { target: { value: VALID_IG_URL } })

    expect(saveButton()).toBeDisabled()
  })

  it('enables Save once a URL and an image are present', async () => {
    const { container } = renderCard()

    fireEvent.change(screen.getByLabelText('Post URL (optional)'), { target: { value: VALID_IG_URL } })
    await addScreenshot(container)

    await waitFor(() => expect(saveButton()).toBeEnabled())
  })

  it('enables Save with an image and no URL at all', async () => {
    const { container } = renderCard()

    await addScreenshot(container)

    await waitFor(() => expect(saveButton()).toBeEnabled())
  })

  it('blocks Save while the URL field holds text that is not a post', async () => {
    const { container } = renderCard()

    await addScreenshot(container)
    fireEvent.change(screen.getByLabelText('Post URL (optional)'), {
      target: { value: 'https://example.com/hello' },
    })

    expect(saveButton()).toBeDisabled()
  })

  it('saves a URL-less capture without the post fields and without a lookup', async () => {
    readPaletteMock.mockResolvedValue(READ_RESULT)
    const { container } = renderCard()

    await addScreenshot(container)
    await waitFor(() => expect(saveButton()).toBeEnabled())

    fireEvent.click(saveButton())

    await waitFor(async () => {
      expect(await listEntries()).toHaveLength(1)
    })

    const [entry] = await listEntries()
    expect(entry).not.toHaveProperty('url')
    expect(entry).not.toHaveProperty('platform')
    expect(entry).not.toHaveProperty('shortcode')
    expect(entry).not.toHaveProperty('author')
    expect(entry.images).toHaveLength(1)
    expect(findByUrlSpy).not.toHaveBeenCalled()
  })

  it('falls back to a design entry and hands the warning to the entry route', async () => {
    readPaletteMock.mockRejectedValue(new Error('no colors'))
    const { container } = renderCard()

    fireEvent.change(screen.getByLabelText('Post URL (optional)'), { target: { value: VALID_IG_URL } })
    await addScreenshot(container)
    await waitFor(() => expect(saveButton()).toBeEnabled())

    fireEvent.click(saveButton())

    await waitFor(async () => {
      expect(await listEntries()).toHaveLength(1)
    })

    const [entry] = await listEntries()
    expect(entry.kind).toBe('design')
    expect(entry.colors).toBeUndefined()
    expect(entry.url).toBe('https://instagram.com/p/Cabc123XY')
    expect(entry.images).toHaveLength(1)
    expect(navigateMock).toHaveBeenCalledWith(`/entry/${entry.id}`, {
      state: { notice: EXTRACTION_WARNING, focusHeading: true },
    })
  })

  it('reads the palette and hands the result to the entry route for review', async () => {
    readPaletteMock.mockResolvedValue(READ_RESULT)
    const { container } = renderCard()

    fireEvent.change(screen.getByLabelText('Post URL (optional)'), { target: { value: VALID_IG_URL } })
    await addScreenshot(container)
    await waitFor(() => expect(saveButton()).toBeEnabled())

    fireEvent.click(saveButton())

    await waitFor(async () => {
      expect(await listEntries()).toHaveLength(1)
    })

    const [entry] = await listEntries()
    expect(entry.colors).toEqual(READ_RESULT.colors)
    expect(entry.paletteSource).toBe('ocr')
    // The auto-crop is offered in the review, never stored behind her back.
    expect(entry.crop).toBeUndefined()
    expect(readPaletteMock).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({
        sourceImageId: entry.images[0].id,
        signal: expect.any(AbortSignal),
      }),
    )
    expect(navigateMock).toHaveBeenCalledWith(`/entry/${entry.id}`, {
      state: { focusHeading: true, pendingRead: READ_RESULT },
    })
  })

  it('still creates the entry from quantize when the read is cancelled', async () => {
    readPaletteMock.mockRejectedValue(new ReadCancelledError())
    extractMock.mockResolvedValue({
      colors: ['#ffffff', '#000000'],
      roleMap: ROLE_MAP,
      degraded: false,
    })
    const { container } = renderCard()

    fireEvent.change(screen.getByLabelText('Post URL (optional)'), { target: { value: VALID_IG_URL } })
    await addScreenshot(container)
    await waitFor(() => expect(saveButton()).toBeEnabled())

    fireEvent.click(saveButton())

    await waitFor(async () => {
      expect(await listEntries()).toHaveLength(1)
    })

    const [entry] = await listEntries()
    expect(entry.kind).toBe('palette')
    expect(entry.colors).toEqual(['#ffffff', '#000000'])
    expect(entry.paletteSource).toBe('quantize')
    expect(navigateMock).toHaveBeenCalledWith(`/entry/${entry.id}`, {
      state: { focusHeading: true },
    })
  })

  it('shows the read progress on Save and offers to cancel it', async () => {
    let settle!: (result: ReadResult) => void
    readPaletteMock.mockImplementation(
      (_blob: Blob, { onProgress }: { onProgress: (p: unknown) => void }) => {
        onProgress({ phase: 'recognizing', fraction: 0.4 })
        return new Promise<ReadResult>((resolve) => {
          settle = resolve
        })
      },
    )
    const { container } = renderCard()

    fireEvent.change(screen.getByLabelText('Post URL (optional)'), { target: { value: VALID_IG_URL } })
    await addScreenshot(container)
    await waitFor(() => expect(saveButton()).toBeEnabled())

    fireEvent.click(saveButton())

    expect(await screen.findByRole('button', { name: 'Reading… 40 %' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel read' })).toBeInTheDocument()

    await act(async () => {
      settle(READ_RESULT)
    })

    await waitFor(async () => {
      expect(await listEntries()).toHaveLength(1)
    })
  })
})
