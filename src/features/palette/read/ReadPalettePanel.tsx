/**
 * ReadPalettePanel — the read/crop controls and the review step (plan §8).
 *
 * A read never lands silently. OCR misreads (`0`/`O`, `8`/`B`) are
 * plausible-looking, so every result arrives here as a checklist: the winning
 * source's unrepaired candidates start checked, repairs trail unchecked, and the
 * losing detectors' colors stay available for the misses OCR made.
 *
 * The panel owns no persistence and no read — it reports which hexes Mia picked
 * and in which mode; `MockPanel` is the single writer.
 */
import { useEffect, useRef, useState } from 'react'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import type { NormalizedRect, PaletteSource } from '../../../types'
import type { ReadResult } from './readPalette'
import type { ReadProgress } from './readProgress'
import { readProgressLabel } from './readProgressLabel'

export type ApplyMode = 'replace' | 'append'

export interface ReadPalettePanelProps {
  result: ReadResult | null
  phase: ReadProgress | null
  error: string | null
  hasCrop: boolean
  onRead: () => void
  onCancelRead: () => void
  onOpenCrop: () => void
  onApply: (colors: string[], mode: ApplyMode) => void
  onKeepAutoCrop: (rect: NormalizedRect) => void
  onDismiss: () => void
}

type PanelMode = 'reading' | 'review' | 'idle'

const SOURCE_BADGE: Record<PaletteSource, string> = {
  ocr: 'OCR',
  blobs: 'BLOB',
  quantize: 'QUANT',
}

const READ_BUTTON_ID = 'read-palette-button'

/**
 * The source that won says what happened; a missing engine only changes *why*
 * OCR is absent. Testing `ocrUnavailable` first described a quantize fallback
 * as swatch shapes, which are two different pictures of the palette.
 */
function summaryFor({ source, candidates, ocrUnavailable }: ReadResult): string {
  if (source === 'ocr') {
    const ocrCandidates = candidates.filter(
      (candidate) => candidate.source === 'ocr',
    )
    const unrepaired = ocrCandidates.filter(
      (candidate) => !candidate.repaired,
    ).length
    const repaired = ocrCandidates.length - unrepaired

    const noun = unrepaired === 1 ? 'hex code' : 'hex codes'
    const suffix = repaired > 0 ? ` (+${repaired} uncertain)` : ''

    return `Read ${unrepaired} ${noun} from the card${suffix}`
  }

  if (source === 'blobs') {
    const reason = ocrUnavailable ? 'OCR unavailable' : 'No hex text found'

    return `${reason} — using swatch shapes`
  }

  return ocrUnavailable
    ? 'OCR unavailable — using quantized colors'
    : 'Using quantized colors'
}

/** Anything the winning detector read outright; a repair has to be opted into. */
function defaultChecks(result: ReadResult | null): boolean[] {
  if (!result) return []

  return result.candidates.map(
    (candidate) => candidate.source === result.source && !candidate.repaired,
  )
}

interface PickedState {
  result: ReadResult | null
  checks: boolean[]
}

function dedupeHex(colors: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const hex of colors) {
    const key = hex.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    unique.push(hex)
  }

  return unique
}

export function ReadPalettePanel({
  result,
  phase,
  error,
  hasCrop,
  onRead,
  onCancelRead,
  onOpenCrop,
  onApply,
  onKeepAutoCrop,
  onDismiss,
}: ReadPalettePanelProps) {
  // A new result resets the checklist during render rather than in an effect:
  // an effect would paint one frame of the previous result's checkboxes.
  const [picked, setPicked] = useState<PickedState>(() => ({
    result,
    checks: defaultChecks(result),
  }))

  if (picked.result !== result) {
    setPicked({ result, checks: defaultChecks(result) })
  }

  const checks = picked.result === result ? picked.checks : defaultChecks(result)
  const mode: PanelMode = phase ? 'reading' : result ? 'review' : 'idle'
  const previousModeRef = useRef<PanelMode>(mode)

  // Apply/Append/Dismiss unmount the button that was focused, which drops focus
  // to the document body and strands keyboard and screen-reader users at the
  // top of the page. The review's own entry point is where they left off.
  useEffect(() => {
    const previous = previousModeRef.current
    previousModeRef.current = mode
    if (mode !== 'idle' || previous !== 'review') return

    document.getElementById(READ_BUTTON_ID)?.focus()
  }, [mode])

  function toggle(index: number) {
    setPicked((previous) => ({
      ...previous,
      checks: previous.checks.map((checked, at) =>
        at === index ? !checked : checked,
      ),
    }))
  }

  const autoCrop = result?.autoCrop
  const pickedHexes = result
    ? dedupeHex(
        result.candidates
          .filter((_, index) => checks[index])
          .map((candidate) => candidate.hex),
      )
    : []

  if (phase) {
    return (
      <section
        aria-label="Read palette"
        className="wire flex flex-wrap items-center gap-3 rounded-block p-3"
      >
        <p aria-live="polite" className="text-sm text-chrome-600">
          {readProgressLabel(phase)}
        </p>
        <Button size="sm" variant="secondary" onClick={onCancelRead}>
          Cancel
        </Button>
      </section>
    )
  }

  if (!result) {
    return (
      <section
        aria-label="Read palette"
        className="wire flex flex-wrap items-center gap-2 rounded-block p-3"
      >
        <Button id={READ_BUTTON_ID} size="sm" onClick={onRead}>
          Read palette
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenCrop}>
          {hasCrop ? 'Edit crop' : 'Crop'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}
      </section>
    )
  }

  return (
    <section
      aria-label="Read palette"
      className="wire flex flex-col gap-3 rounded-block p-3"
    >
      <p className="text-sm text-chrome-700">{summaryFor(result)}</p>

      {autoCrop && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-chrome-600">Read from the detected card</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onKeepAutoCrop(autoCrop)}
          >
            Keep this crop
          </Button>
        </div>
      )}

      <ul className="flex list-none flex-col gap-1.5 p-0">
        {result.candidates.map((candidate, index) => {
          const inputId = `read-candidate-${index}`

          return (
            <li key={inputId} className="flex items-center gap-2">
              <input
                id={inputId}
                type="checkbox"
                checked={checks[index] ?? false}
                onChange={() => toggle(index)}
                className="h-4 w-4 accent-accent"
              />
              <label
                htmlFor={inputId}
                className="flex flex-1 flex-wrap items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 rounded-block border border-chrome-300"
                  style={{ backgroundColor: candidate.hex }}
                />
                <span className="font-mono text-xs text-chrome-800">
                  {candidate.hex}
                </span>
                <Badge>{SOURCE_BADGE[candidate.source]}</Badge>
                {candidate.confidence !== undefined && (
                  <span className="label-mono text-chrome-500">
                    {Math.round(candidate.confidence)}%
                  </span>
                )}
                {candidate.repaired && (
                  <span className="label-mono text-accent">repaired</span>
                )}
              </label>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pickedHexes.length === 0}
          onClick={() => onApply(pickedHexes, 'replace')}
          aria-describedby="apply-hint"
        >
          Apply (replace)
        </Button>
        <span id="apply-hint" className="label-mono text-chrome-500">
          replaces the palette, re-assigns roles, clears overrides
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={pickedHexes.length === 0}
          onClick={() => onApply(pickedHexes, 'append')}
          aria-describedby="append-hint"
        >
          Append
        </Button>
        <span id="append-hint" className="label-mono text-chrome-500">
          adds swatches, keeps roles
        </span>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
