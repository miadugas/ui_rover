import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field } from './Field'

afterEach(cleanup)

describe('Field', () => {
  it('wires aria-invalid and aria-describedby when error is set', () => {
    render(
      <Field id="email" label="Email" error="Enter a valid email">
        {(inputProps) => <input {...inputProps} type="email" />}
      </Field>,
    )

    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'email-error')
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'email-error')
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument()
  })

  it('wires the hint and aria-invalid=false when there is no error', () => {
    render(
      <Field id="note" label="Note" hint="Optional context">
        {(inputProps) => <input {...inputProps} />}
      </Field>,
    )

    const input = screen.getByLabelText('Note')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(input).toHaveAttribute('aria-describedby', 'note-hint')
    expect(screen.getByText('Optional context')).toHaveAttribute('id', 'note-hint')
  })
})
