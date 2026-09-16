import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/Button'
import { updateEntry } from '../../../lib/db'
import { useDebouncedPatch } from '../../../lib/useDebouncedPatch'
import type { Entry, MockTemplateId, Role, RoleMap } from '../../../types'
import { extract } from '../extract'
import { assignRoles, degradedFor } from '../roles'
import { SwatchStrip } from './SwatchStrip'
import type { SwatchChange } from './SwatchStrip'
import { TemplatePicker } from './TemplatePicker'
import { TouchpointPopover } from './TouchpointPopover'
import { WireframeMock } from './WireframeMock'
import type { BlockSpec } from './spec'
import { getTemplate } from './templates'

const FALLBACK_TEMPLATE: MockTemplateId = 'ecommerce'

const SAVE_FAILURE = "Couldn't save changes —"

const EXTRACT_FAILURE = "Couldn't read colors from that image"

const TEMPLATE_SAVE_FAILURE = "Couldn't save the template choice —"

interface PaletteDraft {
  colors: string[]
  roleMap: RoleMap
  blockOverrides: Record<string, string>
  mockTemplate: MockTemplateId
}

interface Selection {
  block: BlockSpec
  anchor: HTMLElement
}

export interface MockPanelProps {
  entry: Entry
  sourceBlob: Blob | null
  sourceUrl: string | null
  selectedBlob?: Blob | null
  selectedImageId?: string | null
}

function draftFrom(entry: Entry): PaletteDraft {
  const colors = entry.colors ?? []

  return {
    colors,
    roleMap: entry.roleMap ?? assignRoles(colors.length > 0 ? colors : ['#ffffff']),
    blockOverrides: entry.blockOverrides ?? {},
    mockTemplate: entry.mockTemplate ?? FALLBACK_TEMPLATE,
  }
}

function withoutOverridesOf(
  overrides: Record<string, string>,
  removedHex: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(overrides).filter(
      ([, hex]) => hex.toLowerCase() !== removedHex.toLowerCase(),
    ),
  )
}

function intrinsicOf(entry: Entry): { width: number; height: number } | null {
  const source =
    entry.images.find((image) => image.id === entry.sourceImageId) ?? entry.images[0]
  if (!source) return null

  return { width: source.width, height: source.height }
}

export function MockPanel({
  entry,
  sourceBlob,
  sourceUrl,
  selectedBlob = null,
  selectedImageId = null,
}: MockPanelProps) {
  const {
    queue,
    flush,
    retry,
    discard,
    isDirty,
    error: saveError,
  } = useDebouncedPatch(entry.id)
  const [draft, setDraft] = useState<PaletteDraft>(() => draftFrom(entry))
  const [selection, setSelection] = useState<Selection | null>(null)
  const [resetError, setResetError] = useState<string>()
  const [extracting, setExtracting] = useState(false)
  const [failedTemplate, setFailedTemplate] = useState<MockTemplateId>()
  const seededAtRef = useRef(entry.updatedAt)

  // The draft is the optimistic mirror; a debounced write lands ~300 ms later
  // and bumps `updatedAt`. Re-seeding only while clean keeps a landing write
  // from clobbering edits the user made in the meantime.
  useEffect(() => {
    if (isDirty) return
    if (seededAtRef.current === entry.updatedAt) return

    seededAtRef.current = entry.updatedAt
    setDraft(draftFrom(entry))
  }, [entry, isDirty])

  function commit(next: PaletteDraft) {
    setDraft(next)
    queue({
      colors: next.colors,
      roleMap: next.roleMap,
      blockOverrides: next.blockOverrides,
      updatedAt: Date.now(),
    })
  }

  // A template choice is a single whole-field write, so it lands immediately
  // rather than joining the debounced palette patch. A rejection has to put the
  // radio back on the stored value: leaving the new one checked would report a
  // save the store never took.
  async function saveTemplate(mockTemplate: MockTemplateId, restoreTo: MockTemplateId) {
    try {
      await updateEntry(entry.id, { mockTemplate, updatedAt: Date.now() })
      setFailedTemplate(undefined)
    } catch {
      setDraft((previous) => ({ ...previous, mockTemplate: restoreTo }))
      setFailedTemplate(mockTemplate)
    }
  }

  function handleTemplateChange(mockTemplate: MockTemplateId) {
    const restoreTo = draft.mockTemplate
    setDraft((previous) => ({ ...previous, mockTemplate }))
    void saveTemplate(mockTemplate, restoreTo)
  }

  function handleRetryTemplate() {
    if (!failedTemplate) return

    handleTemplateChange(failedTemplate)
  }

  function handleSwatchChange(next: SwatchChange) {
    commit({
      ...draft,
      colors: next.colors,
      roleMap: next.roleMap,
      blockOverrides: next.removedHex
        ? withoutOverridesOf(draft.blockOverrides, next.removedHex)
        : draft.blockOverrides,
    })
  }

  function handleApplyRole(role: Role, hex: string) {
    commit({ ...draft, roleMap: { ...draft.roleMap, [role]: hex } })
  }

  function handleOverrideBlock(overrideKey: string, hex: string) {
    commit({
      ...draft,
      blockOverrides: { ...draft.blockOverrides, [overrideKey]: hex },
    })
  }

  function handleClearOverride(overrideKey: string) {
    const { [overrideKey]: _removed, ...rest } = draft.blockOverrides
    commit({ ...draft, blockOverrides: rest })
  }

  // The extraction replaces exactly the fields the debounced draft carries, so
  // the draft is discarded once the replacement is in hand — otherwise a pending
  // (or retried) autosave lands afterwards and restores the palette the user
  // just replaced. A failed extraction leaves the draft and its save state alone,
  // because the edit it would have discarded is still the only copy the user has.
  async function extractInto(blob: Blob, imageId: string | null) {
    setExtracting(true)

    try {
      const result = await extract(blob).catch(() => null)

      if (!result) {
        setResetError(EXTRACT_FAILURE)
        return
      }

      discard()
      setResetError(undefined)
      setDraft((previous) => ({
        ...previous,
        colors: result.colors,
        roleMap: result.roleMap,
        blockOverrides: {},
      }))
      queue({
        ...(imageId ? { sourceImageId: imageId } : {}),
        colors: result.colors,
        roleMap: result.roleMap,
        blockOverrides: {},
        updatedAt: Date.now(),
      })
      await flush()
    } finally {
      setExtracting(false)
    }
  }

  async function handleResetPalette() {
    if (!sourceBlob) {
      setResetError('No source image to read')
      return
    }

    await extractInto(sourceBlob, null)
  }

  async function handleExtractSelected() {
    if (!selectedBlob) return

    await extractInto(selectedBlob, selectedImageId)
  }

  return (
    <section aria-label="Palette mock" className="flex flex-col gap-4">
      {entry.kind === 'design' && (
        <Button
          className="self-start"
          disabled={extracting || !selectedBlob}
          onClick={() => void handleExtractSelected()}
        >
          Extract palette from this image
        </Button>
      )}

      <SwatchStrip
        colors={draft.colors}
        roleMap={draft.roleMap}
        degraded={degradedFor(draft.colors)}
        sourceImageUrl={sourceUrl}
        sourceIntrinsic={intrinsicOf(entry)}
        sourceBlob={sourceBlob}
        onChange={handleSwatchChange}
        onResetPalette={handleResetPalette}
      />

      {resetError && (
        <p role="alert" className="text-sm text-accent">
          {resetError}
        </p>
      )}

      {saveError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-accent">
          {SAVE_FAILURE}
          <Button variant="ghost" size="sm" onClick={() => void retry()}>
            Retry
          </Button>
        </p>
      )}

      <TemplatePicker value={draft.mockTemplate} onChange={handleTemplateChange} />

      {failedTemplate && (
        <p role="alert" className="flex items-center gap-2 text-sm text-accent">
          {TEMPLATE_SAVE_FAILURE}
          <Button variant="ghost" size="sm" onClick={handleRetryTemplate}>
            Retry
          </Button>
        </p>
      )}

      <WireframeMock
        template={getTemplate(draft.mockTemplate)}
        roleMap={draft.roleMap}
        blockOverrides={draft.blockOverrides}
        onSelectBlock={(block, anchor) => setSelection({ block, anchor })}
      />

      <TouchpointPopover
        block={selection?.block ?? null}
        anchor={selection?.anchor ?? null}
        colors={draft.colors}
        roleMap={draft.roleMap}
        blockOverrides={draft.blockOverrides}
        onApplyRole={handleApplyRole}
        onOverrideBlock={handleOverrideBlock}
        onClearOverride={handleClearOverride}
        onClose={() => setSelection(null)}
      />
    </section>
  )
}
