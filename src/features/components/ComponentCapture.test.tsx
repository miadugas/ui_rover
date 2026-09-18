import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDatabaseForTests, getEntry } from '../../lib/db'
import type { Entry, ImageRecord } from '../../types'
import { ComponentCapture } from './ComponentCapture'
import { ComponentTooLargeError } from './cropComponent'
import type { ComponentCrop } from './cropComponent'

const RECT = vi.hoisted(() => ({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }))

const cropComponentMock = vi.hoisted(() => vi.fn())

// `cropComponent` is Canvas-bound; the real `ComponentTooLargeError` is kept so
// the error branch is exercised with the class the component actually checks.
vi.mock('./cropComponent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cropComponent')>()

  return { ...actual, cropComponent: cropComponentMock }
})

// CropTool is pointer-driven and measures a laid-out image, neither of which
// jsdom provides. The stub emits the same two callbacks in the same order.
vi.mock('../palette/read/CropTool', () => ({
  CropTool: ({
    onChange,
    onConfirm,
    onCancel,
  }: {
    onChange: (rect: typeof RECT) => void
    onConfirm: () => void
    onCancel: () => void
  }) => (
    <div>
      <button type="button" onClick={() => onChange(RECT)}>
        stub: set rect
      </button>
      <button type="button" onClick={onConfirm}>
        stub: use crop
      </button>
      <button type="button" onClick={onCancel}>
        stub: cancel crop
      </button>
    </div>
  ),
}))

const createEntryMock = vi.hoisted(() => vi.fn())

const realDb = vi.hoisted(() => ({
  createEntry: undefined as unknown as (
    entry: Entry,
    images: ImageRecord[],
  ) => Promise<void>,
}))

vi.mock('../../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/db')>()
  realDb.createEntry = actual.createEntry

  return { ...actual, createEntry: createEntryMock }
})

const PARENT_ID = 'parent-1'
const PARENT_IMAGE_ID = 'parent-1-img'

function croppedFixture(): ComponentCrop {
  return {
    blob: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/webp' }),
    width: 240,
    height: 120,
    mime: 'image/webp',
    thumb: new Blob([new Uint8Array([7])], { type: 'image/webp' }),
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
    crop: { imageId: PARENT_IMAGE_ID, x: 0.5, y: 0.5, w: 0.25, h: 0.25 },
    tags: [],
    note: '',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }
}

function parentImageRecord(): ImageRecord {
  return {
    id: PARENT_IMAGE_ID,
    entryId: PARENT_ID,
    order: 0,
    width: 800,
    height: 600,
    mime: 'image/png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    thumb: new Blob([new Uint8Array([4])], { type: 'image/png' }),
  }
}

function renderCapture(parent: Entry) {
  const onDone = vi.fn()

  render(
    <ComponentCapture
      parent={parent}
      imageId={PARENT_IMAGE_ID}
      imageUrl="blob:ui_rover/parent"
      imageBlob={new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })}
      intrinsic={{ width: 800, height: 600 }}
      onDone={onDone}
    />,
  )

  return onDone
}

async function drawAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'stub: set rect' }))
  await user.click(screen.getByRole('button', { name: 'stub: use crop' }))
}

beforeEach(async () => {
  await __resetDatabaseForTests()
  cropComponentMock.mockReset()
  cropComponentMock.mockResolvedValue(croppedFixture())
  createEntryMock.mockReset()
  createEntryMock.mockImplementation((entry: Entry, images: ImageRecord[]) =>
    realDb.createEntry(entry, images),
  )
})

afterEach(cleanup)

describe('ComponentCapture', () => {
  it('saves the confirmed crop as a component of the parent', async () => {
    const user = userEvent.setup()
    const parent = parentFixture()
    await realDb.createEntry(parent, [parentImageRecord()])

    const onDone = renderCapture(parent)
    await drawAndConfirm(user)

    const chip = await screen.findByRole('button', { name: 'Card' })
    expect(chip).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Button' })).toHaveFocus()

    await user.click(chip)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))

    expect(cropComponentMock).toHaveBeenCalledWith(expect.anything(), RECT)

    const [created, images] = createEntryMock.mock.calls[0] as [
      Entry,
      ImageRecord[],
    ]
    expect(created.kind).toBe('component')
    expect(created.parentId).toBe(PARENT_ID)
    expect(created.parentImageId).toBe(PARENT_IMAGE_ID)
    expect(created.sourceRect).toEqual(RECT)
    expect(created.componentTags).toEqual(['card'])
    expect(created.url).toBeUndefined()
    expect(created.images).toHaveLength(1)
    expect(images).toHaveLength(1)
    expect(created.sourceImageId).toBe(created.images[0].id)
    expect(images[0].id).toBe(created.images[0].id)
    expect(images[0].entryId).toBe(created.id)

    expect(onDone).toHaveBeenCalledWith(created.id)

    const storedParent = await getEntry(PARENT_ID)
    expect(storedParent?.crop).toEqual(parentFixture().crop)
  })

  it('keeps the initial image provenance when image props change after cropping', async () => {
    const user = userEvent.setup()
    const parent = parentFixture()
    const imageABlob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    const imageBBlob = new Blob([new Uint8Array([2])], { type: 'image/png' })
    const onDone = vi.fn()
    createEntryMock.mockResolvedValueOnce(undefined)

    const view = render(
      <ComponentCapture
        parent={parent}
        imageId={PARENT_IMAGE_ID}
        imageUrl="blob:ui_rover/image-a"
        imageBlob={imageABlob}
        intrinsic={{ width: 800, height: 600 }}
        onDone={onDone}
      />,
    )
    await drawAndConfirm(user)
    await screen.findByRole('button', { name: 'Save' })

    view.rerender(
      <ComponentCapture
        parent={parent}
        imageId="parent-1-image-b"
        imageUrl="blob:ui_rover/image-b"
        imageBlob={imageBBlob}
        intrinsic={{ width: 400, height: 300 }}
        onDone={onDone}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createEntryMock).toHaveBeenCalledTimes(1))
    const [croppedBlob, croppedRect] = cropComponentMock.mock.calls[0] as [
      Blob,
      typeof RECT,
    ]
    expect(croppedBlob).toBe(imageABlob)
    expect(croppedBlob).not.toBe(imageBBlob)
    expect(croppedRect).toEqual(RECT)

    const [created] = createEntryMock.mock.calls[0] as [Entry, ImageRecord[]]
    expect(created.parentImageId).toBe(PARENT_IMAGE_ID)
    expect(created.sourceRect).toEqual(RECT)
  })

  it('returns to the crop step when the crop is too large', async () => {
    const user = userEvent.setup()
    cropComponentMock.mockRejectedValueOnce(new ComponentTooLargeError())

    renderCapture(parentFixture())
    await drawAndConfirm(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Crop is too large — draw a smaller area',
    )
    expect(screen.getByRole('button', { name: 'stub: use crop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('keeps the form with an inline error when the write fails', async () => {
    const user = userEvent.setup()
    const parent = parentFixture()
    await realDb.createEntry(parent, [parentImageRecord()])
    createEntryMock.mockRejectedValueOnce(new Error('write failed'))

    const onDone = renderCapture(parent)
    await drawAndConfirm(user)
    await user.click(await screen.findByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save this component — try again",
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('reports a cancel from either step as no new entry', async () => {
    const user = userEvent.setup()

    const onCropCancel = renderCapture(parentFixture())
    await user.click(screen.getByRole('button', { name: 'stub: cancel crop' }))
    expect(onCropCancel).toHaveBeenCalledWith(null)

    cleanup()

    const onFormCancel = renderCapture(parentFixture())
    await drawAndConfirm(user)
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(onFormCancel).toHaveBeenCalledWith(null)
    expect(createEntryMock).not.toHaveBeenCalled()
  })

  it('goes back to the crop step with the rect still set', async () => {
    const user = userEvent.setup()

    renderCapture(parentFixture())
    await drawAndConfirm(user)
    await user.click(await screen.findByRole('button', { name: 'Back to crop' }))

    await user.click(screen.getByRole('button', { name: 'stub: use crop' }))

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(cropComponentMock).toHaveBeenNthCalledWith(2, expect.anything(), RECT)
  })
})
