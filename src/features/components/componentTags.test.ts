import { describe, expect, it } from 'vitest'
import { COMPONENT_TAGS } from '../../types'
import { COMPONENT_TAG_LABELS, orderedComponentTags } from './componentTags'

describe('COMPONENT_TAG_LABELS', () => {
  it('has exactly one non-empty label per tag in COMPONENT_TAGS', () => {
    expect(Object.keys(COMPONENT_TAG_LABELS).sort()).toEqual([...COMPONENT_TAGS].sort())

    for (const tag of COMPONENT_TAGS) {
      expect(COMPONENT_TAG_LABELS[tag].length).toBeGreaterThan(0)
    }
  })
})

describe('orderedComponentTags', () => {
  it('returns COMPONENT_TAGS order as a fresh array', () => {
    expect(orderedComponentTags()).toEqual([...COMPONENT_TAGS])
    expect(orderedComponentTags()).not.toBe(COMPONENT_TAGS)
  })
})
