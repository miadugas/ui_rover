import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoleMap } from '../../../types'
import { Block } from './Block'
import type { BlockSpec } from './spec'

afterEach(cleanup)

const ROLE_MAP: RoleMap = {
  background: '#ffffff',
  surface: '#eeeeee',
  text: '#111111',
  muted: '#888888',
  primary: '#2244ff',
  accent: '#ff4422',
}

const CTA: BlockSpec = {
  renderKey: 'ecommerce.web.hero.cta',
  overrideKey: 'ecommerce.hero.cta',
  role: 'primary',
  shape: 'pill',
  label: 'shop now',
}

describe('Block', () => {
  it('names itself with its section, role and hex', () => {
    render(<Block block={CTA} sectionLabel="Hero" roleMap={ROLE_MAP} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Hero shop now, primary, #2244ff' })).toBeInTheDocument()
  })

  it('marks an overridden block in its accessible name', () => {
    render(
      <Block
        block={CTA}
        sectionLabel="Hero"
        roleMap={ROLE_MAP}
        blockOverrides={{ 'ecommerce.hero.cta': '#00ff00' }}
        onSelect={() => {}}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Hero shop now, primary, #00ff00, overridden' }),
    ).toBeInTheDocument()
  })

  it('falls back to the shape when the block has no label', () => {
    const unlabeled: BlockSpec = { ...CTA, label: undefined }
    render(<Block block={unlabeled} sectionLabel="Hero" roleMap={ROLE_MAP} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Hero pill, primary, #2244ff' })).toBeInTheDocument()
  })

  it('calls onSelect with the block and the button element on click', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Block block={CTA} sectionLabel="Hero" roleMap={ROLE_MAP} onSelect={onSelect} />)

    const button = screen.getByRole('button')
    await user.click(button)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(CTA, button)
  })

  it('calls onSelect once on Enter and once on Space', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Block block={CTA} sectionLabel="Hero" roleMap={ROLE_MAP} onSelect={onSelect} />)

    const button = screen.getByRole('button')
    button.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith(CTA, button)
  })
})
