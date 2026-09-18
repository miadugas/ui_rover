import type { Entry, Platform } from '../types'

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'IG',
  threads: 'TH',
}

/**
 * The one display name for an entry, for headings, image alts, cards and the
 * Recent row. Only URL-bearing entries have a shortcode, so every other kind
 * falls back here rather than at each call site.
 */
export function entryTitle(entry: Entry, parent?: Entry): string {
  if (entry.shortcode) return entry.shortcode
  if (entry.kind === 'component') {
    return parent ? `Component of ${entryTitle(parent)}` : 'Component'
  }
  return 'Untitled capture'
}
