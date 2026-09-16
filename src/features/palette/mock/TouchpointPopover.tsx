import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { Popover } from '../../../components/Popover'
import type { Role, RoleMap } from '../../../types'
import type { BlockSpec } from './spec'

const HEX_PATTERN = /^#[0-9a-f]{6}$/i

type ApplyMode = 'role' | 'block'

export interface TouchpointPopoverProps {
  block: BlockSpec | null
  anchor: HTMLElement | null
  colors: string[]
  roleMap: RoleMap
  blockOverrides: Record<string, string>
  onApplyRole: (role: Role, hex: string) => void
  onOverrideBlock: (overrideKey: string, hex: string) => void
  onClearOverride: (overrideKey: string) => void
  onClose: () => void
}

/** `renderKey` is `<template>.<frame>.<section>.<element>`; the section reads best. */
function sectionOf(block: BlockSpec): string {
  const segments = block.renderKey.split('.')
  return segments.length >= 3 ? segments[segments.length - 2] : block.renderKey
}

interface TouchpointFormProps extends Omit<TouchpointPopoverProps, 'block' | 'anchor'> {
  block: BlockSpec
}

function TouchpointForm({
  block,
  colors,
  roleMap,
  blockOverrides,
  onApplyRole,
  onOverrideBlock,
  onClearOverride,
  onClose,
}: TouchpointFormProps) {
  const [mode, setMode] = useState<ApplyMode>('role')
  const [hexDraft, setHexDraft] = useState('')
  const [hexError, setHexError] = useState<string>()

  const override = blockOverrides[block.overrideKey]
  const roleHex = roleMap[block.role]

  function apply(hex: string) {
    if (mode === 'role') onApplyRole(block.role, hex)
    else onOverrideBlock(block.overrideKey, hex)
    onClose()
  }

  function handleHexSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const candidate = hexDraft.trim().toLowerCase()

    if (!HEX_PATTERN.test(candidate)) {
      setHexError('Use #rrggbb')
      return
    }

    setHexError(undefined)
    apply(candidate)
  }

  return (
    <div className="flex w-64 flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <p className="label-mono text-chrome-500">
          {sectionOf(block)} {block.label ?? block.shape}
        </p>
        <p className="text-sm text-chrome-800">
          role: <span className="font-mono">{block.role}</span>
        </p>
      </header>

      <div role="radiogroup" aria-label="Apply to" className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm text-chrome-700">
          <input
            type="radio"
            name="touchpoint-mode"
            checked={mode === 'role'}
            onChange={() => setMode('role')}
          />
          All {block.role} blocks
        </label>
        <label className="flex items-center gap-2 text-sm text-chrome-700">
          <input
            type="radio"
            name="touchpoint-mode"
            checked={mode === 'block'}
            onChange={() => setMode('block')}
          />
          Just this block
        </label>
      </div>

      <div role="group" aria-label="Palette" className="flex flex-wrap gap-1.5">
        {colors.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={hex === roleHex}
            onClick={() => apply(hex)}
            className={[
              'h-7 w-7 cursor-pointer rounded-block border transition-transform',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              hex === roleHex ? 'border-chrome-900 ring-1 ring-chrome-900' : 'border-chrome-300',
            ].join(' ')}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>

      <form onSubmit={handleHexSubmit} className="flex flex-col gap-1">
        <label htmlFor="touchpoint-hex" className="label-mono text-chrome-600">
          Hex
        </label>
        <div className="flex gap-1.5">
          <input
            id="touchpoint-hex"
            value={hexDraft}
            placeholder="#rrggbb"
            aria-invalid={Boolean(hexError)}
            aria-describedby={hexError ? 'touchpoint-hex-error' : undefined}
            onChange={(event) => {
              setHexDraft(event.target.value)
              setHexError(undefined)
            }}
            className="w-full rounded-block border border-chrome-300 bg-chrome-0 px-2 py-1 font-mono text-sm text-chrome-800"
          />
          <Button type="submit" size="sm" variant="secondary">
            Apply
          </Button>
        </div>
        {hexError && (
          <p id="touchpoint-hex-error" role="alert" className="text-xs text-accent">
            {hexError}
          </p>
        )}
      </form>

      {override && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onClearOverride(block.overrideKey)
            onClose()
          }}
        >
          Clear override
        </Button>
      )}
    </div>
  )
}

export function TouchpointPopover({ block, anchor, onClose, ...rest }: TouchpointPopoverProps) {
  // Adjust state during render (React-sanctioned) rather than write a ref
  // during render: `Popover` positions itself in a layout effect on open,
  // which — as a child — commits before any effect of ours could run, so
  // the value has to be settled before this render commits, not after it.
  const [persistedAnchor, setPersistedAnchor] = useState(anchor)
  if (anchor && anchor !== persistedAnchor) {
    setPersistedAnchor(anchor)
  }

  // Held past close (never cleared back to null) so `Popover` can restore
  // focus to the block that opened it. A fresh plain object per anchor, not
  // a `useRef`, so `Popover` always reads the current value.
  const anchorRef = useMemo(() => ({ current: persistedAnchor }), [persistedAnchor])

  return (
    <Popover
      open={block !== null}
      onClose={onClose}
      anchorRef={anchorRef}
      label="Block color"
    >
      {block && (
        <TouchpointForm key={block.renderKey} block={block} onClose={onClose} {...rest} />
      )}
    </Popover>
  )
}
