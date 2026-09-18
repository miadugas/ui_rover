import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetDatabaseForTests, createEntry } from '../lib/db'
import type { ComponentTag, Entry, ImageRecord, Kind, Platform } from '../types'
import { LibraryPage } from './LibraryPage'

interface SeedOptions {
  id: string
  platform: Platform
  kind: Kind
  tags: string[]
  note: string
  colors?: string[]
}

function seed(options: SeedOptions): Promise<void> {
  const imageId = `${options.id}-image`

  const entry: Entry = {
    id: options.id,
    url: `https://www.instagram.com/p/${options.id}/`,
    platform: options.platform,
    author: 'kim',
    shortcode: options.id,
    kind: options.kind,
    images: [
      { id: imageId, order: 0, width: 4, height: 5, mime: 'image/png' },
    ],
    tags: options.tags,
    note: options.note,
    createdAt: 1,
    updatedAt: 1,
    ...(options.colors ? { colors: options.colors } : {}),
  }

  const image: ImageRecord = {
    id: imageId,
    entryId: options.id,
    order: 0,
    width: 4,
    height: 5,
    mime: 'image/png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    thumb: new Blob([new Uint8Array([4, 5, 6])], { type: 'image/webp' }),
  }

  return createEntry(entry, [image])
}

interface SeedComponentOptions {
  id: string
  parentId: string
  parentImageId: string
  componentTags: ComponentTag[]
}

function seedComponent(options: SeedComponentOptions): Promise<void> {
  const imageId = `${options.id}-image`

  const entry: Entry = {
    id: options.id,
    kind: 'component',
    parentId: options.parentId,
    parentImageId: options.parentImageId,
    componentTags: options.componentTags,
    images: [{ id: imageId, order: 0, width: 2, height: 2, mime: 'image/webp' }],
    sourceImageId: imageId,
    tags: [],
    note: '',
    createdAt: 2,
    updatedAt: 2,
  }

  const image: ImageRecord = {
    id: imageId,
    entryId: options.id,
    order: 0,
    width: 2,
    height: 2,
    mime: 'image/webp',
    blob: new Blob([new Uint8Array([7, 8, 9])], { type: 'image/webp' }),
    thumb: new Blob([new Uint8Array([1, 1, 1])], { type: 'image/webp' }),
  }

  return createEntry(entry, [image])
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await __resetDatabaseForTests()
})

afterEach(() => {
  cleanup()
})

describe('LibraryPage', () => {
  it('renders a card per stored entry', async () => {
    await seed({
      id: 'entry-one',
      platform: 'instagram',
      kind: 'palette',
      tags: ['warm'],
      note: 'Sunset gradient',
      colors: ['#112233', '#445566'],
    })
    await seed({
      id: 'entry-two',
      platform: 'threads',
      kind: 'design',
      tags: ['grid'],
      note: 'Dense card layout',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(2)
    })

    expect(
      screen.getByRole('link', { name: /Sunset gradient/ }),
    ).toHaveAttribute('href', '/entry/entry-one')
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows the empty state when nothing is stored', async () => {
    renderPage()

    expect(
      await screen.findByText('No posts yet.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Paste your first post' }),
    ).toBeInTheDocument()
  })

  it('renders a component card with its parent title and filters to it by kind', async () => {
    await seed({
      id: 'parent-post',
      platform: 'instagram',
      kind: 'design',
      tags: [],
      note: 'Dopely landing',
    })
    await seedComponent({
      id: 'child-button',
      parentId: 'parent-post',
      parentImageId: 'parent-post-image',
      componentTags: ['button'],
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(2)
    })

    expect(screen.getByText('COMPONENT')).toBeInTheDocument()
    expect(screen.getByText('from parent-post')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Component' }))

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(1)
    })
    expect(screen.getByText('COMPONENT')).toBeInTheDocument()
  })
})
