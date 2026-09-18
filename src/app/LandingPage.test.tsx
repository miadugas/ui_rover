import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry } from '../types'
import { LandingPage } from './LandingPage'

const useLibraryMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/useLibrary', () => ({ useLibrary: useLibraryMock }))

// The capture form has its own suite; the Recent row is what this page adds.
vi.mock('../features/capture/CaptureCard', () => ({
  CaptureCard: () => <div data-testid="capture-card" />,
}))

const IG_ENTRY: Entry = {
  id: 'entry-ig',
  url: 'https://instagram.com/p/Cabc123XY',
  platform: 'instagram',
  shortcode: 'Cabc123XY',
  kind: 'palette',
  images: [],
  tags: [],
  note: '',
  createdAt: 2,
  updatedAt: 2,
}

const URL_LESS_ENTRY: Entry = {
  id: 'entry-bare',
  kind: 'design',
  images: [],
  tags: [],
  note: '',
  createdAt: 1,
  updatedAt: 1,
}

const COMPONENT_ENTRY: Entry = {
  id: 'component-entry',
  kind: 'component',
  parentId: IG_ENTRY.id,
  images: [],
  tags: [],
  note: '',
  createdAt: 3,
  updatedAt: 3,
}

function renderPage(entries: Entry[]) {
  useLibraryMock.mockReturnValue({ entries, status: 'ready' })
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useLibraryMock.mockReset()
})

afterEach(cleanup)

describe('LandingPage recent row', () => {
  it('badges a platform entry and titles it by shortcode', () => {
    renderPage([IG_ENTRY])

    expect(screen.getByText('IG')).toBeInTheDocument()
    expect(screen.getByText('Cabc123XY')).toBeInTheDocument()
  })

  it('drops the platform badge and falls back to a title without a URL', () => {
    renderPage([URL_LESS_ENTRY])

    expect(screen.queryByText('IG')).not.toBeInTheDocument()
    expect(screen.queryByText('TH')).not.toBeInTheDocument()
    expect(screen.getByText('Untitled capture')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/entry/entry-bare')
  })

  it('titles a component from its parent in the Recent row', () => {
    renderPage([COMPONENT_ENTRY, IG_ENTRY])

    expect(screen.getByText('Component of Cabc123XY')).toBeInTheDocument()
  })
})
