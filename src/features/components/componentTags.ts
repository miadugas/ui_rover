/**
 * Display labels for the fixed component chips (plan §5, Discovery decisions).
 *
 * `COMPONENT_TAGS` in `types.ts` is the single source of truth for which tags
 * exist and in which order they render; this module only names them.
 */
import { COMPONENT_TAGS } from '../../types'
import type { ComponentTag } from '../../types'

export const COMPONENT_TAG_LABELS: Record<ComponentTag, string> = {
  button: 'Button',
  nav: 'Nav',
  card: 'Card',
  form: 'Form',
  input: 'Input',
  list: 'List',
  modal: 'Modal',
  table: 'Table',
  hero: 'Hero',
  footer: 'Footer',
  typography: 'Typography',
  icon: 'Icon',
  chart: 'Chart',
  other: 'Other',
}

export function orderedComponentTags(): ComponentTag[] {
  return [...COMPONENT_TAGS]
}
