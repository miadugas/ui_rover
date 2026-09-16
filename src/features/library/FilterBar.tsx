import type { ReactNode } from 'react'
import { Field } from '../../components/Field'
import type { KindFilter, LibraryFilters, PlatformFilter } from './filters'

const KIND_OPTIONS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'palette', label: 'Palette' },
  { value: 'design', label: 'Design' },
]

const PLATFORM_OPTIONS: ReadonlyArray<{ value: PlatformFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'threads', label: 'Threads' },
]

const CHIP_BASE = [
  'label-mono rounded-block border px-2 py-1 transition-colors',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
].join(' ')

const CHIP_ON = 'border-chrome-300 bg-chrome-200 text-chrome-900'
const CHIP_OFF =
  'border-chrome-200 bg-transparent text-chrome-500 hover:text-chrome-800'

interface ChipProps {
  label: string
  pressed: boolean
  onClick: () => void
}

function Chip({ label, pressed, onClick }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${CHIP_BASE} ${pressed ? CHIP_ON : CHIP_OFF}`}
    >
      {label}
    </button>
  )
}

interface ChipGroupProps {
  id: string
  label: string
  children: ReactNode
}

function ChipGroup({ id, label, children }: ChipGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <span id={id} className="label-mono text-chrome-600">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1">
        {children}
      </div>
    </div>
  )
}

export interface FilterBarProps {
  filters: LibraryFilters
  allTags: string[]
  onChange: (filters: LibraryFilters) => void
}

export function FilterBar({ filters, allTags, onChange }: FilterBarProps) {
  const sortedTags = [...allTags].sort((left, right) => left.localeCompare(right))

  const toggleTag = (tag: string) => {
    const nextTags = filters.tags.includes(tag)
      ? filters.tags.filter((candidate) => candidate !== tag)
      : [...filters.tags, tag]
    onChange({ ...filters, tags: nextTags })
  }

  return (
    <div className="flex flex-col gap-3" role="search" aria-label="Filters">
      <ChipGroup id="library-kind-label" label="Kind">
        {KIND_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            pressed={filters.kind === option.value}
            onClick={() => onChange({ ...filters, kind: option.value })}
          />
        ))}
      </ChipGroup>

      <ChipGroup id="library-platform-label" label="Platform">
        {PLATFORM_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            pressed={filters.platform === option.value}
            onClick={() => onChange({ ...filters, platform: option.value })}
          />
        ))}
      </ChipGroup>

      {sortedTags.length > 0 && (
        <ChipGroup id="library-tags-label" label="Tags">
          {sortedTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              pressed={filters.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            />
          ))}
        </ChipGroup>
      )}

      <Field id="library-search" label="Search">
        {(inputProps) => (
          <input
            {...inputProps}
            type="search"
            value={filters.search}
            onChange={(event) =>
              onChange({ ...filters, search: event.target.value })
            }
            placeholder="Note, tag, or author"
            className="w-full rounded-block border border-chrome-300 bg-chrome-0 px-2 py-1.5 text-sm text-chrome-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        )}
      </Field>
    </div>
  )
}
