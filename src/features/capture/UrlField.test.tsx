import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDatabaseForTests, createEntry } from '../../lib/db'
import type { Entry, ImageRecord } from '../../types'
import { INVALID_URL_MESSAGE, UrlField } from './UrlField'
import type { UrlFieldChange } from './UrlField'

const findByUrlSpy = vi.hoisted(() => vi.fn())

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
const NORMALIZED_IG_URL = 'https://instagram.com/p/Cabc123XY'

function seedEntry(url: string): Promise<void> {
  const entry: Entry = {
    id: 'seeded-entry-id',
    url,
    platform: 'instagram',
    shortcode: 'Cabc123XY',
    kind: 'design',
    images: [{ id: 'seeded-image-id', order: 0, width: 10, height: 10, mime: 'image/png' }],
    tags: [],
    note: '',
    createdAt: 1,
    updatedAt: 1,
  }
  const image: ImageRecord = {
    id: 'seeded-image-id',
    entryId: entry.id,
    order: 0,
    width: 10,
    height: 10,
    mime: 'image/png',
    blob: new Blob(['full'], { type: 'image/png' }),
    thumb: new Blob(['thumb'], { type: 'image/png' }),
  }
  return createEntry(entry, [image])
}

function Harness({ onChange }: { onChange: (change: UrlFieldChange) => void }) {
  const [value, setValue] = useState('')

  return (
    <MemoryRouter>
      <UrlField
        value={value}
        onChange={(change) => {
          setValue(change.raw)
          onChange(change)
        }}
      />
    </MemoryRouter>
  )
}

function renderField() {
  const onChange = vi.fn<(change: UrlFieldChange) => void>()
  render(<Harness onChange={onChange} />)
  return { onChange, input: screen.getByLabelText('Post URL (optional)') }
}

beforeEach(async () => {
  await __resetDatabaseForTests()
  findByUrlSpy.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('UrlField', () => {
  it('shows an inline error for a URL that is not a post', () => {
    const { input } = renderField()

    fireEvent.change(input, { target: { value: 'https://example.com/hello' } })

    expect(screen.getByText(INVALID_URL_MESSAGE)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('labels the field as optional', () => {
    const { input } = renderField()

    expect(input).toHaveAttribute('id', 'capture-url')
    expect(screen.getByText('Post URL (optional)')).toBeInTheDocument()
  })

  it('shows no error and no badge while the field is empty', () => {
    const { input } = renderField()

    expect(screen.queryByText(INVALID_URL_MESSAGE)).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText('IG')).not.toBeInTheDocument()
    expect(screen.queryByText('TH')).not.toBeInTheDocument()
  })

  it('never looks up a duplicate for an empty or unparsable field', async () => {
    const { input } = renderField()

    fireEvent.change(input, { target: { value: 'https://example.com/hello' } })
    fireEvent.change(input, { target: { value: '' } })

    // Past the 200 ms duplicate debounce, so a scheduled lookup would have run.
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(screen.queryByText(INVALID_URL_MESSAGE)).not.toBeInTheDocument()
    expect(findByUrlSpy).not.toHaveBeenCalled()
  })

  it('shows the platform badge and reports the parsed URL', async () => {
    const { onChange, input } = renderField()

    fireEvent.change(input, { target: { value: VALID_IG_URL } })

    expect(screen.getByText('IG')).toBeInTheDocument()
    expect(screen.queryByText(INVALID_URL_MESSAGE)).not.toBeInTheDocument()

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          raw: VALID_IG_URL,
          parsed: expect.objectContaining({
            platform: 'instagram',
            normalizedUrl: NORMALIZED_IG_URL,
            shortcode: 'Cabc123XY',
          }),
        }),
      )
    })
  })

  it('links to the existing entry when the URL is already saved', async () => {
    await seedEntry(NORMALIZED_IG_URL)
    const { onChange, input } = renderField()

    fireEvent.change(input, { target: { value: VALID_IG_URL } })

    const link = await screen.findByRole('link', { name: 'Already saved — open it' })
    expect(link).toHaveAttribute('href', '/entry/seeded-entry-id')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ duplicateId: 'seeded-entry-id' }),
    )
  })
})
