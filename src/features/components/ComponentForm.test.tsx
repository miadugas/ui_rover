import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComponentForm } from './ComponentForm'
import type { ComponentFormProps } from './ComponentForm'

afterEach(() => {
  cleanup()
})

function renderForm(overrides: Partial<ComponentFormProps> = {}) {
  const props: ComponentFormProps = {
    previewUrl: 'blob:ui_rover/crop',
    saving: false,
    error: null,
    onSave: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  render(<ComponentForm {...props} />)
  return props
}

describe('ComponentForm', () => {
  it('focuses the first chip on mount', () => {
    renderForm()

    expect(screen.getByRole('button', { name: 'Button' })).toHaveFocus()
  })

  it('toggles a chip on and off', () => {
    renderForm()

    const chip = screen.getByRole('button', { name: 'Card' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('starts from initialTags', () => {
    renderForm({ initialTags: ['nav'] })

    expect(screen.getByRole('button', { name: 'Nav' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('emits the toggled chips, free tags and note on save', () => {
    const { onSave } = renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Button' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hero' }))

    const tagInput = screen.getByLabelText('Tags')
    fireEvent.change(tagInput, { target: { value: 'rounded' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })

    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'nice pill shape' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({
      componentTags: ['button', 'hero'],
      tags: ['rounded'],
      note: 'nice pill shape',
    })
  })

  it('saves with zero chips selected', () => {
    const { onSave } = renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({
      componentTags: [],
      tags: [],
      note: '',
    })
  })

  it('marks Save busy and disabled while saving', () => {
    renderForm({ saving: true })

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-busy', 'true')
    expect(save).toBeDisabled()
  })

  it('fires onBack and onCancel', () => {
    const { onBack, onCancel } = renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Back to crop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders an error as an alert', () => {
    renderForm({ error: 'Crop is too large — draw a smaller area' })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Crop is too large — draw a smaller area',
    )
  })

  it('falls back to a placeholder when there is no preview', () => {
    renderForm({ previewUrl: null })

    expect(screen.queryByAltText('Component crop preview')).not.toBeInTheDocument()
    expect(screen.getByText('No preview')).toBeInTheDocument()
  })
})
