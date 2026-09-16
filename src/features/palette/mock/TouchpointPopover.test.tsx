import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoleMap } from '../../../types'
import { TouchpointPopover } from './TouchpointPopover'
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

const COLORS = ['#ffffff', '#2244ff', '#111111']

const CTA: BlockSpec = {
  renderKey: 'ecommerce.web.hero.cta',
  overrideKey: 'ecommerce.hero.cta',
  role: 'primary',
  shape: 'pill',
  label: 'shop now',
}

interface HarnessProps {
  blockOverrides?: Record<string, string>
  onApplyRole?: (role: string, hex: string) => void
  onOverrideBlock?: (overrideKey: string, hex: string) => void
  onClearOverride?: (overrideKey: string) => void
}

function Harness({
  blockOverrides = {},
  onApplyRole = () => {},
  onOverrideBlock = () => {},
  onClearOverride = () => {},
}: HarnessProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  return (
    <div>
      <button type="button" onClick={(event) => setAnchor(event.currentTarget)}>
        Hero shop now
      </button>
      <TouchpointPopover
        block={anchor ? CTA : null}
        anchor={anchor}
        colors={COLORS}
        roleMap={ROLE_MAP}
        blockOverrides={blockOverrides}
        onApplyRole={onApplyRole}
        onOverrideBlock={onOverrideBlock}
        onClearOverride={onClearOverride}
        onClose={() => setAnchor(null)}
      />
    </div>
  )
}

function openPopover() {
  return screen.getByRole('button', { name: 'Hero shop now' })
}

describe('TouchpointPopover', () => {
  it('opens with the block label and its role', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(openPopover())

    expect(screen.getByRole('dialog', { name: 'Block color' })).toBeInTheDocument()
    expect(screen.getByText('hero shop now')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All primary blocks' })).toBeChecked()
  })

  it('applies a picked swatch to the whole role by default', async () => {
    const user = userEvent.setup()
    const onApplyRole = vi.fn()
    const onOverrideBlock = vi.fn()
    render(<Harness onApplyRole={onApplyRole} onOverrideBlock={onOverrideBlock} />)

    await user.click(openPopover())
    await user.click(screen.getByRole('button', { name: '#111111' }))

    expect(onApplyRole).toHaveBeenCalledWith('primary', '#111111')
    expect(onOverrideBlock).not.toHaveBeenCalled()
  })

  it('marks the swatch currently holding the role color', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(openPopover())

    expect(screen.getByRole('button', { name: '#2244ff' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('writes a per-block override in "Just this block" mode', async () => {
    const user = userEvent.setup()
    const onApplyRole = vi.fn()
    const onOverrideBlock = vi.fn()
    render(<Harness onApplyRole={onApplyRole} onOverrideBlock={onOverrideBlock} />)

    await user.click(openPopover())
    await user.click(screen.getByRole('radio', { name: 'Just this block' }))
    await user.click(screen.getByRole('button', { name: '#111111' }))

    expect(onOverrideBlock).toHaveBeenCalledWith('ecommerce.hero.cta', '#111111')
    expect(onApplyRole).not.toHaveBeenCalled()
  })

  it('offers Clear override only when the block has one', async () => {
    const user = userEvent.setup()
    const onClearOverride = vi.fn()
    const { unmount } = render(<Harness onClearOverride={onClearOverride} />)

    await user.click(openPopover())
    expect(screen.queryByRole('button', { name: 'Clear override' })).not.toBeInTheDocument()
    unmount()

    render(
      <Harness
        blockOverrides={{ 'ecommerce.hero.cta': '#00ff00' }}
        onClearOverride={onClearOverride}
      />,
    )
    await user.click(openPopover())
    await user.click(screen.getByRole('button', { name: 'Clear override' }))

    expect(onClearOverride).toHaveBeenCalledWith('ecommerce.hero.cta')
  })

  it('rejects a malformed hex and applies a valid one', async () => {
    const user = userEvent.setup()
    const onApplyRole = vi.fn()
    render(<Harness onApplyRole={onApplyRole} />)

    await user.click(openPopover())
    await user.type(screen.getByLabelText('Hex'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Use #rrggbb')
    expect(onApplyRole).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Hex'))
    await user.type(screen.getByLabelText('Hex'), '#ABCDEF')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApplyRole).toHaveBeenCalledWith('primary', '#abcdef')
  })

  it('closes on Escape and returns focus to the block', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(openPopover())
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(openPopover()).toHaveFocus()
  })
})
