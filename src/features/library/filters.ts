import type { Entry, Kind, Platform } from '../../types'

export type KindFilter = Kind | 'all'
export type PlatformFilter = Platform | 'all'

export interface LibraryFilters {
  kind: KindFilter
  platform: PlatformFilter
  tags: string[]
  search: string
}

export const EMPTY_FILTERS: LibraryFilters = {
  kind: 'all',
  platform: 'all',
  tags: [],
  search: '',
}

function matchesSearch(entry: Entry, needle: string): boolean {
  const haystack = [entry.note, entry.author ?? '', ...entry.tags]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
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
    if (!filters.tags.every((tag) => entry.tags.includes(tag))) return false
    if (needle && !matchesSearch(entry, needle)) return false
    return true
  })
}
