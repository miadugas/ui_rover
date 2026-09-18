import { describe, expect, it } from 'vitest'
import type { Entry } from '../types'
import { entryTitle } from './platform'

function makeEntry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    kind: 'design',
    images: [],
    tags: [],
    note: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('entryTitle', () => {
  it('uses the shortcode when the entry has one', () => {
    expect(
      entryTitle(makeEntry({ id: 'a', shortcode: 'Cabc123XY' })),
    ).toBe('Cabc123XY')
  })

  it('falls back to "Untitled capture" for a URL-less capture', () => {
    expect(entryTitle(makeEntry({ id: 'b' }))).toBe('Untitled capture')
    expect(entryTitle(makeEntry({ id: 'c', kind: 'palette' }))).toBe(
      'Untitled capture',
    )
  })

  it('names a component after its parent when one is given', () => {
    const parent = makeEntry({ id: 'p', shortcode: 'Cparent1' })
    const component = makeEntry({ id: 'k', kind: 'component', parentId: 'p' })

    expect(entryTitle(component, parent)).toBe('Component of Cparent1')
  })

  it('names a component after an untitled parent', () => {
    const parent = makeEntry({ id: 'p' })
    const component = makeEntry({ id: 'k', kind: 'component', parentId: 'p' })

    expect(entryTitle(component, parent)).toBe('Component of Untitled capture')
  })

  it('falls back to "Component" when the parent cannot be resolved', () => {
    expect(entryTitle(makeEntry({ id: 'k', kind: 'component' }))).toBe('Component')
  })

  it('prefers a component’s own shortcode when it somehow has one', () => {
    expect(
      entryTitle(makeEntry({ id: 'k', kind: 'component', shortcode: 'Cown' })),
    ).toBe('Cown')
  })
})
