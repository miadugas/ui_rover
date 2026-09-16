import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoleMap } from '../../../types'
import { SwatchStrip } from './SwatchStrip'
import type { SwatchStripProps } from './SwatchStrip'

afterEach(cleanup)

const ROLE_MAP: RoleMap = {
  background: '#ffffff',
  surface: '#808080',
  text: '#000000',
  muted: '#808080',
  primary: '#000000',
  accent: '#000000',
}

function renderStrip(overrides: Partial<SwatchStripProps> = {}) {
  const onChange = vi.fn()
  const onResetPalette = vi.fn(() => Promise.resolve())

  render(
    <SwatchStrip
      colors={['#ffffff', '#000000', '#808080']}
      roleMap={ROLE_MAP}
      degraded={false}
      sourceImageUrl={null}
      sourceIntrinsic={null}
      sourceBlob={null}
      onChange={onChange}
      onResetPalette={onResetPalette}
      {...overrides}
    />,
  )

  return { onChange, onResetPalette }
}

describe('SwatchStrip', () => {
  it('disables remove when only one swatch is left', () => {
    renderStrip({
      colors: ['#ffffff'],
      roleMap: {
        background: '#ffffff',
        surface: '#ffffff',
        text: '#ffffff',
        muted: '#ffffff',
        primary: '#ffffff',
        accent: '#ffffff',
      },
    })

    expect(screen.getByRole('button', { name: 'Remove #ffffff' })).toBeDisabled()
  })

  it('re-assigns orphaned roles to the nearest remaining color and reports the removed hex', async () => {
    const user = userEvent.setup()
    const { onChange } = renderStrip()

    await user.click(screen.getByRole('button', { name: 'Remove #000000' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      colors: ['#ffffff', '#808080'],
      roleMap: {
        background: '#ffffff',
        surface: '#808080',
        text: '#808080',
        muted: '#808080',
        primary: '#808080',
        accent: '#808080',
      },
      removedHex: '#000000',
    })
  })

  it('lists the roles a swatch currently carries', () => {
    renderStrip()

    const swatch = screen.getByRole('button', { name: 'Copy #ffffff' }).closest('li')
    expect(swatch).not.toBeNull()
    expect(swatch).toHaveTextContent('background')
  })

  it('rejects a malformed hex and appends a valid one', async () => {
    const user = userEvent.setup()
    const { onChange } = renderStrip()

    await user.type(screen.getByLabelText('Add by hex'), 'blue')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Use #rrggbb')
    expect(onChange).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Add by hex'))
    await user.type(screen.getByLabelText('Add by hex'), '#123456')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onChange).toHaveBeenCalledWith({
      colors: ['#ffffff', '#000000', '#808080', '#123456'],
      roleMap: ROLE_MAP,
    })
  })

  it('refuses a hex already in the palette', async () => {
    const user = userEvent.setup()
    const { onChange } = renderStrip()

    await user.type(screen.getByLabelText('Add by hex'), '#808080')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Already in the palette')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows the degraded notice and keeps pick-from-image off without a source', () => {
    renderStrip({ colors: ['#ffffff', '#000000'], degraded: true })

    expect(screen.getByText('Palette too small — add colors')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick from image' })).toBeDisabled()
  })

  it('re-runs extraction through onResetPalette', async () => {
    const user = userEvent.setup()
    const { onResetPalette } = renderStrip()

    await user.click(screen.getByRole('button', { name: 'Reset palette' }))

    expect(onResetPalette).toHaveBeenCalledTimes(1)
  })
})
