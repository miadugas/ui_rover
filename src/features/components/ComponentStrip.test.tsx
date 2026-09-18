import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDatabaseForTests, createEntry, getEntry } from '../../lib/db'
import type { ComponentTag, Entry, ImageRecord } from '../../types'
import { ComponentStrip } from './ComponentStrip'

const deleteEntryMock = vi.hoisted(() => vi.fn())

const realDb = vi.hoisted(() => ({
  deleteEntry: undefined as unknown as (id: string) => Promise<void>,
}))

vi.mock('../../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/db')>()
  realDb.deleteEntry = actual.deleteEntry

  return { ...actual, deleteEntry: deleteEntryMock }
})

const PARENT_ID = 'parent-1'
const PARENT_IMAGE_ID = 'parent-1-img'

function imageRecord(entryId: string, id: string): ImageRecord {
  return {
    id,
    entryId,
    order: 0,
    width: 200,
    height: 100,
    mime: 'image/webp',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    thumb: new Blob([new Uint8Array([4])], { type: 'image/webp' }),
  }
}

function parentFixture(): Entry {
  return {
    id: PARENT_ID,
    url: 'https://instagram.com/p/parent-1',
    platform: 'instagram',
    shortcode: 'parent-1',
    kind: 'design',
    images: [
      { id: PARENT_IMAGE_ID, order: 0, width: 800, height: 600, mime: 'image/png' },
    ],
    sourceImageId: PARENT_IMAGE_ID,
    tags: [],
    note: '',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }
}

function childFixture(
  id: string,
  componentTags: ComponentTag[],
  createdAt: number,
): Entry {
  return {
    id,
    kind: 'component',
    parentId: PARENT_ID,
    parentImageId: PARENT_IMAGE_ID,
    sourceRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    images: [{ id: `${id}-img`, order: 0, width: 200, height: 100, mime: 'image/webp' }],
    sourceImageId: `${id}-img`,
    componentTags,
    tags: [],
    note: '',
    createdAt,
    updatedAt: createdAt,
  }
}

async function seedChild(child: Entry): Promise<void> {
  await createEntry(child, [imageRecord(child.id, child.images[0].id)])
}

function renderStrip(parent: Entry, focusId?: string) {
  render(
    <MemoryRouter>
      <ComponentStrip parent={parent} focusId={focusId} />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await __resetDatabaseForTests()
  deleteEntryMock.mockReset()
  deleteEntryMock.mockImplementation((id: string) => realDb.deleteEntry(id))
  await createEntry(parentFixture(), [imageRecord(PARENT_ID, PARENT_IMAGE_ID)])
})

afterEach(cleanup)

describe('ComponentStrip', () => {
  it('renders nothing while the parent has no components', async () => {
    renderStrip(parentFixture())

    await waitFor(() =>
      expect(screen.queryByRole('heading')).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('lists each child with its chips and a named link', async () => {
    await seedChild(childFixture('child-1', ['button', 'nav'], 1))
    await seedChild(childFixture('child-2', [], 2))

    renderStrip(parentFixture())

    expect(
      await screen.findByRole('heading', { name: 'Components (2)' }),
    ).toBeInTheDocument()

    const first = screen.getByRole('link', {
      name: 'component: button, nav — from parent-1',
    })
    expect(first).toHaveAttribute('href', '/entry/child-1')
    expect(screen.getByText('Button')).toBeInTheDocument()
    expect(screen.getByText('Nav')).toBeInTheDocument()

    expect(
      screen.getByRole('link', { name: 'component: untagged — from parent-1' }),
    ).toHaveAttribute('href', '/entry/child-2')
  })

  it('shows at most three chips', async () => {
    await seedChild(
      childFixture('child-3', ['button', 'nav', 'card', 'form', 'hero'], 1),
    )
    renderStrip(parentFixture())

    await screen.findByRole('link')
    expect(screen.getByText('Button')).toBeInTheDocument()
    expect(screen.getByText('Card')).toBeInTheDocument()
    expect(screen.queryByText('Form')).not.toBeInTheDocument()
    expect(screen.queryByText('Hero')).not.toBeInTheDocument()
  })

  it('removes a child only after the inline confirm', async () => {
    const user = userEvent.setup()
    await seedChild(childFixture('child-4', ['card'], 1))
    renderStrip(parentFixture())

    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(await getEntry('child-4')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Confirm remove' }))

    await waitFor(async () => expect(await getEntry('child-4')).toBeUndefined())
    await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument())
  })

  it('keeps the child and reports a failed remove', async () => {
    const user = userEvent.setup()
    await seedChild(childFixture('child-5', ['card'], 1))
    renderStrip(parentFixture())

    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    deleteEntryMock.mockRejectedValueOnce(new Error('delete failed'))
    await user.click(screen.getByRole('button', { name: 'Confirm remove' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't remove this component — try again",
    )
    expect(await getEntry('child-5')).toBeDefined()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('focuses the link of the child named by focusId', async () => {
    await seedChild(childFixture('child-6', ['button'], 1))
    await seedChild(childFixture('child-7', ['nav'], 2))

    renderStrip(parentFixture(), 'child-7')

    const focused = await screen.findByRole('link', {
      name: 'component: nav — from parent-1',
    })
    await waitFor(() => expect(focused).toHaveFocus())
  })
})
