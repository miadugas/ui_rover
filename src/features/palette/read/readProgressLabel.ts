/**
 * The one wording of a read's progress, shared by the three surfaces that can
 * start one (Capture's Save button, EntryPage's first extract, the read panel).
 * It lives apart from `ReadPalettePanel` so that file only exports components.
 */
import type { ReadProgress } from './readProgress'

export function readProgressLabel({ phase, fraction }: ReadProgress): string {
  if (phase === 'loading-engine') return 'Loading reader…'
  if (phase === 'detecting') return 'Detecting swatches…'
  if (phase === 'recognizing') {
    return `Reading… ${Math.round((fraction ?? 0) * 100)} %`
  }

  return 'Reading…'
}
