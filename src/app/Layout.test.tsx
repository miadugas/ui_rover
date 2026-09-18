import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageFallbackReason } from '../lib/db'
import { Layout } from './Layout'

const openDbMock = vi.hoisted(() => vi.fn())
const storageFallbackReasonMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/db', () => ({
  openDb: openDbMock,
  storageFallbackReason: storageFallbackReasonMock,
}))

const UNAVAILABLE_TEXT = 'Storage unavailable — this session is in-memory only.'
const UPGRADE_FAILED_TEXT =
  'Storage upgrade failed — this session is in-memory; your saved entries are intact but not loaded.'

function renderLayout() {
  render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  openDbMock.mockReset()
  openDbMock.mockResolvedValue(null)
  storageFallbackReasonMock.mockReset()
  storageFallbackReasonMock.mockReturnValue('none' satisfies StorageFallbackReason)
})

afterEach(cleanup)

describe('StorageBanner', () => {
  it('stays hidden when storage opened normally', async () => {
    renderLayout()

    expect(await screen.findByRole('link', { name: 'ui_rover' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reports unavailable storage', async () => {
    storageFallbackReasonMock.mockReturnValue('unavailable')
    renderLayout()

    expect(await screen.findByRole('status')).toHaveTextContent(UNAVAILABLE_TEXT)
  })

  it('reports a failed upgrade with the entries-are-intact wording', async () => {
    storageFallbackReasonMock.mockReturnValue('upgrade-failed')
    renderLayout()

    expect(await screen.findByRole('status')).toHaveTextContent(UPGRADE_FAILED_TEXT)
  })

  it('falls back to the unavailable text when openDb itself rejects', async () => {
    openDbMock.mockRejectedValue(new Error('blocked'))
    renderLayout()

    expect(await screen.findByRole('status')).toHaveTextContent(UNAVAILABLE_TEXT)
  })
})
