import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { MOCK_TEMPLATE_IDS } from '../../../types'
import type { MockTemplateId } from '../../../types'
import { findTemplate } from './templates'

export interface TemplatePickerProps {
  value: MockTemplateId
  onChange: (id: MockTemplateId) => void
  className?: string
}

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

function isAvailable(id: MockTemplateId): boolean {
  return findTemplate(id) !== undefined
}

export function TemplatePicker({ value, onChange, className = '' }: TemplatePickerProps) {
  const buttonRefs = useRef(new Map<MockTemplateId, HTMLButtonElement>())

  function moveFocus(from: MockTemplateId, step: number) {
    const total = MOCK_TEMPLATE_IDS.length
    const start = MOCK_TEMPLATE_IDS.indexOf(from)

    for (let offset = 1; offset <= total; offset += 1) {
      const next = MOCK_TEMPLATE_IDS[(start + step * offset + total * offset) % total]
      if (!isAvailable(next)) continue
      onChange(next)
      buttonRefs.current.get(next)?.focus()
      return
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: MockTemplateId) {
    const step = ARROW_STEP[event.key]
    if (step === undefined) return
    event.preventDefault()
    moveFocus(id, step)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Mock template"
      className={`inline-flex flex-wrap gap-1 rounded-block border border-chrome-300 bg-chrome-50 p-1 ${className}`}
    >
      {MOCK_TEMPLATE_IDS.map((id) => {
        const template = findTemplate(id)
        const selected = id === value

        return (
          <button
            key={id}
            ref={(node) => {
              if (node) buttonRefs.current.set(id, node)
              else buttonRefs.current.delete(id)
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={template === undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, id)}
            className={[
              'label-mono cursor-pointer rounded-block px-2 py-1 transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              'disabled:cursor-not-allowed disabled:opacity-40',
              selected
                ? 'bg-chrome-0 text-chrome-900 border border-chrome-300'
                : 'border border-transparent text-chrome-600 hover:bg-chrome-100',
            ].join(' ')}
          >
            {template?.label ?? id}
          </button>
        )
      })}
    </div>
  )
}
