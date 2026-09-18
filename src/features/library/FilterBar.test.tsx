import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('hides the component-type row by default and shows it when told to', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <FilterBar filters={EMPTY_FILTERS} allTags={[]} onChange={onChange} />,
    )

    expect(
      screen.queryByRole('group', { name: 'Component type' }),
    ).not.toBeInTheDocument()

    rerender(
      <FilterBar
        filters={EMPTY_FILTERS}
        allTags={[]}
        showComponentTags
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('group', { name: 'Component type' })).toBeInTheDocument()
  })

  it('presses the component-type chip and emits the filter', () => {
    const onChange = vi.fn()
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        allTags={[]}
        showComponentTags
        onChange={onChange}
      />,
    )

    const group = screen.getByRole('group', { name: 'Component type' })
    fireEvent.click(within(group).getByRole('button', { name: 'Button' }))

    expect(onChange).toHaveBeenCalledWith(withFilters({ componentTag: 'button' }))
  })

  it('resets to the "All" component-type chip when filters are cleared', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <FilterBar
        filters={withFilters({ componentTag: 'button' })}
        allTags={[]}
        showComponentTags
        onChange={onChange}
      />,
    )

    const group = screen.getByRole('group', { name: 'Component type' })
    expect(within(group).getByRole('button', { name: 'Button' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    rerender(
      <FilterBar
        filters={EMPTY_FILTERS}
        allTags={[]}
        showComponentTags
        onChange={onChange}
      />,
    )

    expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
