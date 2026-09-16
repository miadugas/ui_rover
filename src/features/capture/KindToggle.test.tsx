import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Kind } from '../../types'
import { KindToggle } from './KindToggle'

function Harness() {
  const [kind, setKind] = useState<Kind>('palette')
  return <KindToggle value={kind} onChange={setKind} />
}

afterEach(() => {
  cleanup()
})

describe('KindToggle', () => {
  it('starts on the palette radio', () => {
    render(<Harness />)

    expect(screen.getByRole('radio', { name: 'Palette' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('aria-checked', 'false')
  })

  it('moves the selection with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const palette = screen.getByRole('radio', { name: 'Palette' })
    const design = screen.getByRole('radio', { name: 'Design' })

    palette.focus()
    await user.keyboard('{ArrowRight}')

    expect(design).toHaveAttribute('aria-checked', 'true')
    expect(palette).toHaveAttribute('aria-checked', 'false')
    expect(design).toHaveFocus()

    await user.keyboard('{ArrowLeft}')

    expect(palette).toHaveAttribute('aria-checked', 'true')
    expect(palette).toHaveFocus()
  })
})
