import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDatabaseForTests, listEntries } from '../../lib/db'
import { CaptureCard, EXTRACTION_WARNING } from './CaptureCard'

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
  navigateMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('CaptureCard', () => {
  it('keeps Save disabled with a valid URL but no image', () => {
    renderCard()

    fireEvent.change(screen.getByLabelText('Post URL'), { target: { value: VALID_IG_URL } })

    expect(saveButton()).toBeDisabled()
  })

  it('enables Save once a URL and an image are present', async () => {
    const { container } = renderCard()

    fireEvent.change(screen.getByLabelText('Post URL'), { target: { value: VALID_IG_URL } })
    await addScreenshot(container)

    await waitFor(() => expect(saveButton()).toBeEnabled())
  })

  it('leaves Save disabled with an image but no URL', async () => {
    const { container } = renderCard()

    await addScreenshot(container)

    expect(saveButton()).toBeDisabled()
  })

  it('falls back to a design entry and hands the warning to the entry route', async () => {
    extractMock.mockRejectedValue(new Error('no colors'))
    const { container } = renderCard()

    fireEvent.change(screen.getByLabelText('Post URL'), { target: { value: VALID_IG_URL } })
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

  it('navigates without a notice when extraction succeeds', async () => {
    extractMock.mockResolvedValue({
      colors: ['#ffffff', '#000000'],
      roleMap: {
        background: '#ffffff',
        surface: '#ffffff',
        text: '#000000',
        muted: '#000000',
        primary: '#000000',
        accent: '#000000',
      },
      degraded: false,
    })
    const { container } = renderCard()

    fireEvent.change(screen.getByLabelText('Post URL'), { target: { value: VALID_IG_URL } })
    await addScreenshot(container)
    await waitFor(() => expect(saveButton()).toBeEnabled())

    fireEvent.click(saveButton())

    await waitFor(async () => {
      expect(await listEntries()).toHaveLength(1)
    })

    const [entry] = await listEntries()
    expect(navigateMock).toHaveBeenCalledWith(`/entry/${entry.id}`, {
      state: { focusHeading: true },
    })
  })
})
