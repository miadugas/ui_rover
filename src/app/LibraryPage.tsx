import { useMemo, useState } from 'react'
import { EmptyState } from '../features/library/EmptyState'
import { EntryCard } from '../features/library/EntryCard'
import { ExportImport } from '../features/library/ExportImport'
import { FilterBar } from '../features/library/FilterBar'
import { EMPTY_FILTERS, applyFilters } from '../features/library/filters'
import type { LibraryFilters } from '../features/library/filters'
import { useLibrary } from '../lib/useLibrary'

const SKELETON_COUNT = 6
const SKELETON_KEYS = Array.from(
  { length: SKELETON_COUNT },
  (_unused, idx) => `skeleton-${idx}`,
)

const GRID_CLASSES =
  'grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'

export function LibraryPage() {
  const { entries, status, error } = useLibrary()
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS)

  const allTags = useMemo(
    () => Array.from(new Set(entries.flatMap((entry) => entry.tags))),
    [entries],
  )

  const visibleEntries = useMemo(
    () => applyFilters(entries, filters),
    [entries, filters],
  )

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-baseline gap-2">
        <h1 className="text-xl font-semibold text-chrome-900">Library</h1>
        <p className="label-mono text-chrome-500">{entries.length}</p>
      </header>

      {status === 'error' && (
        <p className="text-sm text-accent" role="alert">
          {error?.message ?? 'Something went wrong loading the library.'}
        </p>
      )}

      {status === 'loading' ? (
        <div className={GRID_CLASSES} aria-hidden="true">
          {SKELETON_KEYS.map((key) => (
            <div key={key} className="wire aspect-4/5 rounded-block" />
          ))}
        </div>
      ) : (
        <>
          <FilterBar filters={filters} allTags={allTags} onChange={setFilters} />

          {entries.length === 0 && <EmptyState variant="empty" />}

          {entries.length > 0 && visibleEntries.length === 0 && (
            <EmptyState
              variant="no-results"
              onClear={() => setFilters(EMPTY_FILTERS)}
            />
          )}

          {visibleEntries.length > 0 && (
            <div className={GRID_CLASSES}>
              {visibleEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </>
      )}

      <section aria-label="Backup" className="flex flex-col gap-3">
        <h2 className="label-mono text-chrome-700">Backup</h2>
        <ExportImport />
      </section>
    </section>
  )
}
