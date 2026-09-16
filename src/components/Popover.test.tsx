import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Popover } from './Popover'

afterEach(cleanup)

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(initialOpen)

  return (
    <div>
      <button ref={anchorRef} onClick={() => setOpen(true)}>
        Open popover
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label="Test popover">
        <button>First action</button>
        <button>Second action</button>
      </Popover>
    </div>
  )
}

describe('Popover', () => {
  it('renders nothing when closed', () => {
    render(<Harness initialOpen={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens with content and auto-focuses the first focusable child', () => {
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'Test popover' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus()
  })

  it('closes on Escape and returns focus to the anchor', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open popover' })).toHaveFocus()
  })

  it('closes on outside pointerdown', () => {
    render(<Harness />)

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
