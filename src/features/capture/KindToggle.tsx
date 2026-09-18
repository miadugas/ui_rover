import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { CaptureKind } from '../../types'

const OPTIONS: ReadonlyArray<{ kind: CaptureKind; label: string }> = [
  { kind: 'palette', label: 'Palette' },
  { kind: 'design', label: 'Design' },
]

const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp'])
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown'])

export interface KindToggleProps {
  value: CaptureKind
  onChange: (kind: CaptureKind) => void
  disabled?: boolean
}

export function KindToggle({ value, onChange, disabled }: KindToggleProps) {
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectAt = (idx: number) => {
    const option = OPTIONS[idx]
    if (!option) return
    onChange(option.kind)
    radioRefs.current[idx]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (!PREVIOUS_KEYS.has(event.key) && !NEXT_KEYS.has(event.key)) return
    event.preventDefault()
    const step = NEXT_KEYS.has(event.key) ? 1 : -1
    selectAt((idx + step + OPTIONS.length) % OPTIONS.length)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="label-mono text-chrome-600" id="capture-kind-label">
        Kind
      </span>
      <div
        role="radiogroup"
        aria-labelledby="capture-kind-label"
        className="wire inline-flex w-fit gap-1 rounded-block p-1"
      >
        {OPTIONS.map((option, idx) => {
          const checked = option.kind === value
          return (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              tabIndex={checked ? 0 : -1}
              ref={(node) => {
                radioRefs.current[idx] = node
              }}
              onClick={() => onChange(option.kind)}
              onKeyDown={(event) => onKeyDown(event, idx)}
              className={[
                'label-mono rounded-block px-3 py-1.5 transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                'disabled:cursor-not-allowed disabled:opacity-40',
                checked
                  ? 'bg-chrome-200 text-chrome-900'
                  : 'bg-transparent text-chrome-500 hover:text-chrome-800',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
