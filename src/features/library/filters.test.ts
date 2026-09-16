import { describe, expect, it } from 'vitest'
import type { Entry, Kind, Platform } from '../../types'
import { EMPTY_FILTERS, applyFilters } from './filters'
import type { LibraryFilters } from './filters'

function makeEntry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    url: `https://www.instagram.com/p/${overrides.id}/`,
    platform: 'instagram' as Platform,
    shortcode: overrides.id,
    kind: 'palette' as Kind,
    images: [],
    tags: [],
    note: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function withFilters(overrides: Partial<LibraryFilters>): LibraryFilters {
  return { ...EMPTY_FILTERS, ...overrides }
}

const PALETTE_IG = makeEntry({
  id: 'a',
  kind: 'palette',
  platform: 'instagram',
  tags: ['warm', 'retro'],
  note: 'Sunset gradient study',
  author: 'kim',
})

const DESIGN_TH = makeEntry({
  id: 'b',
  kind: 'design',
  platform: 'threads',
  tags: ['warm', 'grid'],
  note: 'Dense card layout',
  author: 'lee',
})

const DESIGN_IG = makeEntry({
  id: 'c',
  kind: 'design',
  platform: 'instagram',
  tags: ['retro'],
  note: 'Type specimen',
})

const ALL_ENTRIES = [PALETTE_IG, DESIGN_TH, DESIGN_IG]

function ids(entries: Entry[]): string[] {
  return entries.map((entry) => entry.id)
}

describe('applyFilters', () => {
  it('returns every entry in source order with the empty filters', () => {
    expect(ids(applyFilters(ALL_ENTRIES, EMPTY_FILTERS))).toEqual(['a', 'b', 'c'])
  })

  it('filters by kind', () => {
    expect(ids(applyFilters(ALL_ENTRIES, withFilters({ kind: 'design' })))).toEqual(
      ['b', 'c'],
    )
  })

  it('filters by platform', () => {
    expect(
      ids(applyFilters(ALL_ENTRIES, withFilters({ platform: 'threads' }))),
    ).toEqual(['b'])
  })

  it('filters by a single tag', () => {
    expect(ids(applyFilters(ALL_ENTRIES, withFilters({ tags: ['retro'] })))).toEqual(
      ['a', 'c'],
    )
  })

  it('ANDs across selected tags', () => {
    expect(
      ids(applyFilters(ALL_ENTRIES, withFilters({ tags: ['warm', 'retro'] }))),
    ).toEqual(['a'])
  })

  it('searches the note case-insensitively', () => {
    expect(ids(applyFilters(ALL_ENTRIES, withFilters({ search: 'SUNSET' })))).toEqual(
      ['a'],
    )
  })

  it('searches tags', () => {
    expect(ids(applyFilters(ALL_ENTRIES, withFilters({ search: 'grid' })))).toEqual([
      'b',
    ])
  })

  it('searches the author', () => {
    expect(ids(applyFilters(ALL_ENTRIES, withFilters({ search: 'Lee' })))).toEqual([
      'b',
    ])
  })

  it('combines kind, platform and search', () => {
    expect(
      ids(
        applyFilters(
          ALL_ENTRIES,
          withFilters({ kind: 'design', platform: 'instagram', search: 'type' }),
        ),
      ),
    ).toEqual(['c'])
  })

  it('returns nothing when no entry matches', () => {
    expect(applyFilters(ALL_ENTRIES, withFilters({ search: 'nonexistent' }))).toEqual(
      [],
    )
  })
})
