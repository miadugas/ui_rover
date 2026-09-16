import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterBar } from './FilterBar'
import { EMPTY_FILTERS } from './filters'
import type { LibraryFilters } from './filters'

afterEach(() => {
  cleanup()
})

function withFilters(overrides: Partial<LibraryFilters>): LibraryFilters {
  return { ...EMPTY_FILTERS, ...overrides }
}

describe('FilterBar', () => {
  it('marks the active kind chip pressed and reports a change', () => {
    const onChange = vi.fn()
    render(
      <FilterBar filters={EMPTY_FILTERS} allTags={[]} onChange={onChange} />,
    )

    expect(screen.getByRole('button', { name: 'Palette' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Palette' }))

    expect(onChange).toHaveBeenCalledWith(withFilters({ kind: 'palette' }))
  })

  it('hides the tag group when there are no tags and sorts them when there are', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <FilterBar filters={EMPTY_FILTERS} allTags={[]} onChange={onChange} />,
    )

    expect(screen.queryByRole('group', { name: 'Tags' })).not.toBeInTheDocument()

    rerender(
      <FilterBar
        filters={EMPTY_FILTERS}
        allTags={['warm', 'grid', 'retro']}
        onChange={onChange}
      />,
    )

    const tagGroup = screen.getByRole('group', { name: 'Tags' })
    expect(
      Array.from(tagGroup.querySelectorAll('button'), (node) => node.textContent),
    ).toEqual(['grid', 'retro', 'warm'])
  })

  it('toggles a tag off when it is already selected', () => {
    const onChange = vi.fn()
    render(
      <FilterBar
        filters={withFilters({ tags: ['warm'] })}
        allTags={['warm']}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'warm' }))

    expect(onChange).toHaveBeenCalledWith(withFilters({ tags: [] }))
  })

  it('reports search input', () => {
    const onChange = vi.fn()
    render(
      <FilterBar filters={EMPTY_FILTERS} allTags={[]} onChange={onChange} />,
    )

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'retro' },
    })

    expect(onChange).toHaveBeenCalledWith(withFilters({ search: 'retro' }))
  })
})
