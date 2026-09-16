import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TagEditor } from './TagEditor'

afterEach(cleanup)

function renderEditor(tags: string[]) {
  const onChange = vi.fn()
  render(<TagEditor tags={tags} onChange={onChange} />)
  return { onChange, input: screen.getByLabelText('Tags') }
}

describe('TagEditor', () => {
  it('adds a trimmed, lowercased tag on Enter', async () => {
    const user = userEvent.setup()
    const { onChange, input } = renderEditor([])

    await user.type(input, '  Muted Blue  {Enter}')

    expect(onChange).toHaveBeenCalledWith(['muted blue'])
  })

  it('adds a tag on comma', async () => {
    const user = userEvent.setup()
    const { onChange, input } = renderEditor(['ig'])

    await user.type(input, 'gradient,')

    expect(onChange).toHaveBeenCalledWith(['ig', 'gradient'])
  })

  it('ignores a duplicate regardless of case', async () => {
    const user = userEvent.setup()
    const { onChange, input } = renderEditor(['blue'])

    await user.type(input, 'BLUE{Enter}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes the last tag on Backspace in an empty input', async () => {
    const user = userEvent.setup()
    const { onChange, input } = renderEditor(['one', 'two'])

    await user.click(input)
    await user.keyboard('{Backspace}')

    expect(onChange).toHaveBeenCalledWith(['one'])
  })

  it('keeps the tags when Backspace only edits the draft', async () => {
    const user = userEvent.setup()
    const { onChange, input } = renderEditor(['one'])

    await user.type(input, 'ab{Backspace}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes a tag through its chip button', async () => {
    const user = userEvent.setup()
    const { onChange } = renderEditor(['one', 'two'])

    await user.click(screen.getByRole('button', { name: 'Remove one' }))

    expect(onChange).toHaveBeenCalledWith(['two'])
  })
})
