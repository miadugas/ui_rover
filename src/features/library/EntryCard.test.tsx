import { cleanup, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { Entry } from '../../types'
import { EntryCard } from './EntryCard'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

const PALETTE_ENTRY: Entry = {
  id: '01HZZPALETTE',
  url: 'https://www.instagram.com/p/Cabc123XY/',
  platform: 'instagram',
  author: 'kim',
  shortcode: 'Cabc123XY',
  kind: 'palette',
  images: [{ id: 'img-1', order: 0, width: 1080, height: 1350, mime: 'image/png' }],
  colors: ['#112233', '#445566', '#778899', '#aabbcc', '#ccddee', '#eeff00', '#ffffff'],
  tags: ['warm', 'retro', 'grid', 'extra'],
  note: 'A'.repeat(120),
  createdAt: 2,
  updatedAt: 2,
}

const DESIGN_ENTRY: Entry = {
  id: '01HZZDESIGN',
  url: 'https://www.threads.com/@lee/post/Cxyz789/',
  platform: 'threads',
  author: 'lee',
  shortcode: 'Cxyz789',
  kind: 'design',
  images: [{ id: 'img-2', order: 0, width: 800, height: 1000, mime: 'image/png' }],
  tags: [],
  note: '',
  createdAt: 1,
  updatedAt: 1,
}

const URL_LESS_ENTRY: Entry = {
  id: '01HZZNOURL',
  kind: 'design',
  images: [{ id: 'img-3', order: 0, width: 900, height: 1200, mime: 'image/png' }],
  tags: [],
  note: '',
  createdAt: 3,
  updatedAt: 3,
}

const COMPONENT_ENTRY: Entry = {
  id: '01HZZCOMPONENT',
  kind: 'component',
  parentId: DESIGN_ENTRY.id,
  parentImageId: 'img-2',
  componentTags: ['button', 'nav', 'card', 'form'],
  images: [{ id: 'img-4', order: 0, width: 200, height: 60, mime: 'image/webp' }],
  sourceImageId: 'img-4',
  tags: [],
  note: '',
  createdAt: 4,
  updatedAt: 4,
}

function renderCard(entry: Entry, parent?: Entry) {
  return render(
    <HashRouter>
      <EntryCard entry={entry} parent={parent} />
    </HashRouter>,
  )
}

describe('EntryCard', () => {
  it('links to the entry route by hash', () => {
    renderCard(PALETTE_ENTRY)

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', `#/entry/${PALETTE_ENTRY.id}`)
  })

  it('renders platform and kind badges', () => {
    renderCard(PALETTE_ENTRY)

    expect(screen.getByText('IG')).toBeInTheDocument()
    expect(screen.getByText('palette')).toBeInTheDocument()
  })

  it('renders the threads badge for a threads design entry', () => {
    renderCard(DESIGN_ENTRY)

    expect(screen.getByText('TH')).toBeInTheDocument()
    expect(screen.getByText('design')).toBeInTheDocument()
  })

  it('renders the shortcode as the card title', () => {
    renderCard(PALETTE_ENTRY)

    expect(screen.getByText('Cabc123XY')).toBeInTheDocument()
  })

  it('omits the platform badge and falls back to a title for a URL-less entry', () => {
    renderCard(URL_LESS_ENTRY)

    expect(screen.queryByText('IG')).not.toBeInTheDocument()
    expect(screen.queryByText('TH')).not.toBeInTheDocument()
    expect(screen.getByText('Untitled capture')).toBeInTheDocument()
    expect(screen.getByText('design')).toBeInTheDocument()
  })

  it('renders at most six swatches, each labelled with its hex', () => {
    renderCard(PALETTE_ENTRY)

    expect(screen.getAllByRole('img')).toHaveLength(6)
    expect(screen.getByLabelText('#112233')).toBeInTheDocument()
    expect(screen.queryByLabelText('#ffffff')).not.toBeInTheDocument()
  })

  it('renders no swatches for an entry without colors', () => {
    renderCard(DESIGN_ENTRY)

    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('caps tag chips at three and truncates the note at 80 characters', () => {
    renderCard(PALETTE_ENTRY)

    expect(screen.getByText('warm')).toBeInTheDocument()
    expect(screen.queryByText('extra')).not.toBeInTheDocument()
    expect(screen.getByText(`${'A'.repeat(80)}…`)).toBeInTheDocument()
  })

  it('renders the component badge, capped chips, parent line and no platform badge', () => {
    renderCard(COMPONENT_ENTRY, DESIGN_ENTRY)

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', `#/entry/${COMPONENT_ENTRY.id}`)
    expect(screen.getByText('COMPONENT')).toBeInTheDocument()
    expect(screen.getByText('Button')).toBeInTheDocument()
    expect(screen.getByText('Nav')).toBeInTheDocument()
    expect(screen.getByText('Card')).toBeInTheDocument()
    expect(screen.queryByText('Form')).not.toBeInTheDocument()
    expect(screen.getByText(`from ${DESIGN_ENTRY.shortcode}`)).toBeInTheDocument()
    expect(screen.queryByText('IG')).not.toBeInTheDocument()
    expect(screen.queryByText('TH')).not.toBeInTheDocument()
  })

  it('omits the "from" line for a component without a resolvable parent', () => {
    renderCard(COMPONENT_ENTRY)

    expect(screen.queryByText(/^from /)).not.toBeInTheDocument()
  })
})
