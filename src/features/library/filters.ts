import { COMPONENT_TAG_LABELS } from '../components/componentTags'
import type { ComponentTag, Entry, Kind, Platform } from '../../types'

export type KindFilter = Kind | 'all'
export type PlatformFilter = Platform | 'all'
export type ComponentTagFilter = ComponentTag | 'all'

export interface LibraryFilters {
  kind: KindFilter
  platform: PlatformFilter
  componentTag: ComponentTagFilter
  tags: string[]
  search: string
}

export const EMPTY_FILTERS: LibraryFilters = {
  kind: 'all',
  platform: 'all',
  componentTag: 'all',
  tags: [],
  search: '',
}

function matchesSearch(entry: Entry, needle: string): boolean {
  const tagLabels = (entry.componentTags ?? []).map(
    (tag) => COMPONENT_TAG_LABELS[tag],
  )
  const haystack = [entry.note, entry.author ?? '', ...entry.tags, ...tagLabels]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

/** True when at least one entry is a component — gates the FilterBar's component-tag row. */
export function hasComponents(entries: Entry[]): boolean {
  return entries.some((entry) => entry.kind === 'component')
}

/**
 * Pure filter pass. `entries` arrives newest-first from `listEntries`, and the
 * order is preserved — sort toggles are a Later item (plan §11).
 */
export function applyFilters(
  entries: Entry[],
  filters: LibraryFilters,
): Entry[] {
  const needle = filters.search.trim().toLowerCase()

  return entries.filter((entry) => {
    if (filters.kind !== 'all' && entry.kind !== filters.kind) return false
    if (filters.platform !== 'all' && entry.platform !== filters.platform) {
      return false
    }
    if (
      filters.componentTag !== 'all' &&
      !entry.componentTags?.includes(filters.componentTag)
    ) {
      return false
    }
    if (!filters.tags.every((tag) => entry.tags.includes(tag))) return false
    if (needle && !matchesSearch(entry, needle)) return false
    return true
  })
}
