import { useEffect, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { Button } from '../../../components/Button'
import { ROLES } from '../../../types'
import type { Role, RoleMap } from '../../../types'
import { mapContainClick } from '../containMap'
import { fromHex, relativeLuminance } from '../quantize'
import { assignRoles } from '../roles'
import { samplePixel } from '../samplePixel'

const HEX_PATTERN = /^#[0-9a-f]{6}$/i

export interface SwatchChange {
  colors: string[]
  roleMap: RoleMap
  /** Set when the change came from removing a swatch, so overrides holding it can be dropped. */
  removedHex?: string
}

export interface SwatchStripProps {
  colors: string[]
  roleMap: RoleMap
  degraded: boolean
  sourceImageUrl: string | null
  sourceIntrinsic: { width: number; height: number } | null
  sourceBlob: Blob | null
  onChange: (next: SwatchChange) => void
  onResetPalette: () => Promise<void>
}

function rolesUsing(roleMap: RoleMap, hex: string): Role[] {
  return ROLES.filter((role) => roleMap[role].toLowerCase() === hex.toLowerCase())
}

function nearestByLuminance(candidates: string[], hex: string): string {
  const target = relativeLuminance(fromHex(hex))

  return [...candidates].sort(
    (left, right) =>
      Math.abs(relativeLuminance(fromHex(left)) - target) -
      Math.abs(relativeLuminance(fromHex(right)) - target),
  )[0]
}

function roleMapWithout(roleMap: RoleMap, removedHex: string, remaining: string[]): RoleMap {
  const replacement = nearestByLuminance(remaining, removedHex)
  const next = { ...roleMap }

  for (const role of rolesUsing(roleMap, removedHex)) {
    next[role] = replacement
  }

  return next
}

function Swatch({
  hex,
  roleMap,
  canRemove,
  onCopy,
  onRemove,
}: {
  hex: string
  roleMap: RoleMap
  canRemove: boolean
  onCopy: (hex: string) => void
  onRemove: (hex: string) => void
}) {
  const roles = rolesUsing(roleMap, hex)

  return (
    <li className="flex w-24 flex-col gap-1">
      <button
        type="button"
        aria-label={`Copy ${hex}`}
        onClick={() => onCopy(hex)}
        className="h-12 w-full cursor-pointer rounded-block border border-chrome-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-xs text-chrome-700">{hex}</span>
      {roles.length > 0 && (
        <span className="flex flex-wrap gap-0.5">
          {roles.map((role) => (
            <span
              key={role}
              className="label-mono rounded-block bg-chrome-100 px-1 py-0.5 text-chrome-600"
            >
              {role}
            </span>
          ))}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={!canRemove}
        aria-label={`Remove ${hex}`}
        onClick={() => onRemove(hex)}
      >
        Remove
      </Button>
    </li>
  )
}

export function SwatchStrip({
  colors,
  roleMap,
  degraded,
  sourceImageUrl,
  sourceIntrinsic,
  sourceBlob,
  onChange,
  onResetPalette,
}: SwatchStripProps) {
  const [hexDraft, setHexDraft] = useState('')
  const [addError, setAddError] = useState<string>()
  const [sampling, setSampling] = useState(false)
  const [status, setStatus] = useState<string>()

  const canSample = Boolean(sourceImageUrl && sourceBlob && sourceIntrinsic)

  useEffect(() => {
    if (!sampling) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSampling(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [sampling])

  function handleCopy(hex: string) {
    void navigator.clipboard?.writeText(hex)
    setStatus(`Copied ${hex}`)
  }

  function handleRemove(hex: string) {
    if (colors.length <= 1) return

    const remaining = colors.filter((candidate) => candidate !== hex)
    onChange({
      colors: remaining,
      roleMap: roleMapWithout(roleMap, hex, remaining),
      removedHex: hex,
    })
    setStatus(`Removed ${hex}`)
  }

  function appendColor(hex: string) {
    if (colors.includes(hex)) return
    onChange({ colors: [...colors, hex], roleMap })
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const candidate = hexDraft.trim().toLowerCase()

    if (!HEX_PATTERN.test(candidate)) {
      setAddError('Use #rrggbb')
      return
    }
    if (colors.includes(candidate)) {
      setAddError('Already in the palette')
      return
    }

    setAddError(undefined)
    setHexDraft('')
    appendColor(candidate)
  }

  async function handleSampleClick(event: MouseEvent<HTMLImageElement>) {
    if (!sourceBlob || !sourceIntrinsic) return

    const point = mapContainClick({
      clientX: event.clientX,
      clientY: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(),
      intrinsicW: sourceIntrinsic.width,
      intrinsicH: sourceIntrinsic.height,
    })
    if (!point) return

    try {
      const hex = await samplePixel(sourceBlob, point.nx, point.ny)
      appendColor(hex)
      setStatus(`Added ${hex}`)
      setSampling(false)
    } catch {
      setStatus('Could not read that pixel')
    }
  }

  return (
    <section aria-label="Palette" className="flex flex-col gap-3">
      {degraded && (
        <p role="status" className="text-sm text-chrome-600">
          Palette too small — add colors
        </p>
      )}

      <ul className="flex list-none flex-wrap gap-3 p-0">
        {colors.map((hex) => (
          <Swatch
            key={hex}
            hex={hex}
            roleMap={roleMap}
            canRemove={colors.length > 1}
            onCopy={handleCopy}
            onRemove={handleRemove}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={handleAdd} className="flex flex-col gap-1">
          <label htmlFor="swatch-add-hex" className="label-mono text-chrome-600">
            Add by hex
          </label>
          <div className="flex gap-1.5">
            <input
              id="swatch-add-hex"
              value={hexDraft}
              placeholder="#rrggbb"
              aria-invalid={Boolean(addError)}
              aria-describedby={addError ? 'swatch-add-hex-error' : undefined}
              onChange={(event) => {
                setHexDraft(event.target.value)
                setAddError(undefined)
              }}
              className="w-32 rounded-block border border-chrome-300 bg-chrome-0 px-2 py-1 font-mono text-sm text-chrome-800"
            />
            <Button type="submit" size="sm" variant="secondary">
              Add
            </Button>
          </div>
        </form>

        <Button
          size="sm"
          variant="secondary"
          disabled={!canSample}
          aria-pressed={sampling}
          onClick={() => setSampling((previous) => !previous)}
        >
          {sampling ? 'Stop picking' : 'Pick from image'}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ colors, roleMap: assignRoles(colors) })}
        >
          Reset roles
        </Button>

        <Button size="sm" variant="ghost" onClick={() => void onResetPalette()}>
          Reset palette
        </Button>
      </div>

      {addError && (
        <p id="swatch-add-hex-error" role="alert" className="text-xs text-accent">
          {addError}
        </p>
      )}

      {sampling && sourceImageUrl && (
        <div className="flex flex-col gap-1">
          <p className="label-mono text-chrome-500">click the image to sample a color</p>
          <img
            src={sourceImageUrl}
            alt="Source screenshot — click to sample a color"
            onClick={(event) => void handleSampleClick(event)}
            className="max-h-80 w-full cursor-crosshair object-contain"
          />
        </div>
      )}

      <p role="status" className="sr-only">
        {status}
      </p>
    </section>
  )
}
