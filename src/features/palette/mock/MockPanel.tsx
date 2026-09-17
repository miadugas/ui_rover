import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/Button'
import { updateEntry } from '../../../lib/db'
import { useDebouncedPatch } from '../../../lib/useDebouncedPatch'
import type {
  Entry,
  MockTemplateId,
  NormalizedRect,
  Role,
  RoleMap,
} from '../../../types'
import { CropTool } from '../read/CropTool'
import { ReadPalettePanel } from '../read/ReadPalettePanel'
import type { ApplyMode } from '../read/ReadPalettePanel'
import { readPalette } from '../read/readPalette'
import type { ReadResult } from '../read/readPalette'
import { ReadCancelledError, createReadController } from '../read/readProgress'
import type { ReadController, ReadProgress } from '../read/readProgress'
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

const CROP_SAVE_FAILURE = "Couldn't save the crop —"

const NO_SOURCE_FAILURE = 'No source image to read'

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

type StoredCrop = NonNullable<Entry['crop']>

/** `null` is a real value here — a failed *clear* has to be retryable too. */
interface FailedCrop {
  rect: NormalizedRect | null
}

export interface MockPanelProps {
  entry: Entry
  sourceBlob: Blob | null
  sourceUrl: string | null
  selectedBlob?: Blob | null
  selectedImageId?: string | null
  pendingRead?: ReadResult | null
  onPendingReadConsumed?: () => void
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

/**
 * Strips a rect down to its geometry. A `StoredCrop` handed back from state
 * still carries the `imageId` it was written under, and that id must never
 * survive into a new write — the stored crop always names the *current* source.
 */
function pickRect(rect: NormalizedRect): NormalizedRect {
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
}

function sourceImageOf(entry: Entry) {
  return (
    entry.images.find((image) => image.id === entry.sourceImageId) ?? entry.images[0]
  )
}

function intrinsicOf(entry: Entry): { width: number; height: number } | null {
  const source = sourceImageOf(entry)
  if (!source) return null

  return { width: source.width, height: source.height }
}

export function MockPanel({
  entry,
  sourceBlob,
  sourceUrl,
  selectedBlob = null,
  selectedImageId = null,
  pendingRead = null,
  onPendingReadConsumed,
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
  const [readResult, setReadResult] = useState<ReadResult | null>(null)
  const [readPhase, setReadPhase] = useState<ReadProgress | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  // The crop everything downstream reads — the reader, the "Edit crop" label —
  // is the last *known-persisted* one. It moves only when a write lands (or
  // optimistically, and then straight back if that write is rejected), so a
  // failed save can never leave a rect active that IndexedDB never took.
  const [crop, setCrop] = useState<StoredCrop | null>(() => entry.crop ?? null)
  // The editor's in-progress rect. Dragging is not a decision, so it stays here
  // and never touches `crop` until Confirm sends it through `saveCrop`.
  const [editorRect, setEditorRect] = useState<NormalizedRect | null>(null)
  const [failedCrop, setFailedCrop] = useState<FailedCrop>()
  const seededAtRef = useRef(entry.updatedAt)
  const readControllerRef = useRef<ReadController | null>(null)
  const consumedReadRef = useRef<ReadResult | null>(null)

  // The draft is the optimistic mirror; a debounced write lands ~300 ms later
  // and bumps `updatedAt`. Re-seeding only while clean keeps a landing write
  // from clobbering edits the user made in the meantime.
  useEffect(() => {
    if (isDirty) return
    if (seededAtRef.current === entry.updatedAt) return

    seededAtRef.current = entry.updatedAt
    setDraft(draftFrom(entry))
    setCrop(entry.crop ?? null)
  }, [entry, isDirty])

  // A read handed over from Capture (router state) or from EntryPage's first
  // extract is already applied; opening the review is all that is left. The ref
  // makes it once-per-result, so a re-render cannot re-open a dismissed panel.
  useEffect(() => {
    if (!pendingRead) return
    if (consumedReadRef.current === pendingRead) return

    consumedReadRef.current = pendingRead
    setReadResult(pendingRead)
    onPendingReadConsumed?.()
  }, [pendingRead, onPendingReadConsumed])

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

  // The crop is passed through untouched even when it names another image: the
  // orchestrator ignores a mismatched `imageId`, which is the one place that
  // rule lives. Clearing it here would fight the next crop write.
  function runRead(blob: Blob, imageId: string | null): Promise<ReadResult> {
    const controller = createReadController()
    readControllerRef.current = controller
    setReadPhase({ phase: 'idle' })

    return readPalette(blob, {
      sourceImageId: imageId ?? entry.sourceImageId ?? '',
      crop: crop ?? undefined,
      onProgress: setReadPhase,
      signal: controller.signal,
    })
  }

  function finishRead() {
    readControllerRef.current = null
    setReadPhase(null)
  }

  // A preview read writes nothing: it fills the review panel and waits. Cancel
  // is indistinguishable from "never happened" on purpose.
  async function handleRead() {
    if (!sourceBlob) {
      setReadError(NO_SOURCE_FAILURE)
      return
    }

    setReadError(null)

    try {
      setReadResult(await runRead(sourceBlob, entry.sourceImageId ?? selectedImageId))
    } catch (error) {
      if (error instanceof ReadCancelledError) return

      setReadError(EXTRACT_FAILURE)
    } finally {
      finishRead()
    }
  }

  function handleCancelRead() {
    readControllerRef.current?.cancel()
  }

  // The read replaces exactly the fields the debounced draft carries, so the
  // draft is discarded once the replacement is in hand — otherwise a pending
  // (or retried) autosave lands afterwards and restores the palette the user
  // just replaced. A failed read leaves the draft and its save state alone,
  // because the edit it would have discarded is still the only copy the user has.
  async function extractInto(blob: Blob, imageId: string | null) {
    setExtracting(true)

    try {
      const result = await runRead(blob, imageId)

      discard()
      setResetError(undefined)
      setReadError(null)
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
        paletteSource: result.source,
        updatedAt: Date.now(),
      })
      await flush()
      setReadResult(result)
    } catch (error) {
      if (!(error instanceof ReadCancelledError)) setResetError(EXTRACT_FAILURE)
    } finally {
      finishRead()
      setExtracting(false)
    }
  }

  async function handleResetPalette() {
    if (!sourceBlob) {
      setResetError(NO_SOURCE_FAILURE)
      return
    }

    await extractInto(sourceBlob, null)
  }

  async function handleExtractSelected() {
    if (!selectedBlob) return

    await extractInto(selectedBlob, selectedImageId)
  }

  // Replace re-assigns roles and drops the block overrides, because the hexes
  // they pinned are gone. Append is swatches only — it never removes anything,
  // so it cannot move a role out from under an override.
  async function handleApplyRead(colors: string[], mode: ApplyMode) {
    const result = readResult
    if (!result || colors.length === 0) return

    setReadResult(null)

    if (mode === 'append') {
      const merged = dedupeHex([...draft.colors, ...colors])
      setDraft((previous) => ({ ...previous, colors: merged }))
      queue({ colors: merged, updatedAt: Date.now() })
      await flush()
      return
    }

    const roleMap = assignRoles(colors)
    discard()
    setDraft((previous) => ({
      ...previous,
      colors,
      roleMap,
      blockOverrides: {},
    }))
    queue({
      colors,
      roleMap,
      blockOverrides: {},
      paletteSource: result.source,
      updatedAt: Date.now(),
    })
    await flush()
  }

  // Same shape as `saveTemplate`: the optimistic rect lands first so a read
  // fired straight after a confirm already sees it, the write follows
  // immediately, and a rejection puts the previous rect back rather than
  // reporting a save the store never took.
  async function saveCrop(rect: NormalizedRect | null) {
    const imageId = sourceImageOf(entry)?.id
    // `imageId` last: `rect` may be a `StoredCrop` seeded into the editor under
    // an older source, and that id must not outlive the image it named.
    const next = rect && imageId ? { ...pickRect(rect), imageId } : null
    const previous = crop

    setCrop(next)

    try {
      await updateEntry(entry.id, {
        crop: next ?? undefined,
        updatedAt: Date.now(),
      })
      setFailedCrop(undefined)
    } catch {
      setCrop(previous)
      setFailedCrop({ rect })
    }
  }

  // The editor seeds off the persisted crop, so a cancelled or failed session
  // has nothing to unwind.
  function handleOpenCrop() {
    setEditorRect(crop)
    setCropOpen(true)
  }

  // Dragging only moves the editor's rect; clearing is a decision, so it writes.
  function handleCropChange(rect: NormalizedRect | null) {
    setEditorRect(rect)

    if (!rect && crop) void saveCrop(null)
  }

  function handleConfirmCrop() {
    setCropOpen(false)
    void saveCrop(editorRect)
  }

  function handleCancelCrop() {
    setCropOpen(false)
    setEditorRect(crop)
  }

  function handleRetryCrop() {
    if (!failedCrop) return

    void saveCrop(failedCrop.rect)
  }

  const intrinsic = intrinsicOf(entry)

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

      <ReadPalettePanel
        result={readResult}
        phase={readPhase}
        error={readError}
        hasCrop={Boolean(crop)}
        onRead={() => void handleRead()}
        onCancelRead={handleCancelRead}
        onOpenCrop={handleOpenCrop}
        onApply={(colors, mode) => void handleApplyRead(colors, mode)}
        onKeepAutoCrop={(rect) => void saveCrop(rect)}
        onDismiss={() => setReadResult(null)}
      />

      {cropOpen && sourceUrl && intrinsic && (
        <CropTool
          imageUrl={sourceUrl}
          intrinsic={intrinsic}
          value={editorRect}
          onChange={handleCropChange}
          onConfirm={handleConfirmCrop}
          onCancel={handleCancelCrop}
        />
      )}

      {failedCrop && (
        <p role="alert" className="flex items-center gap-2 text-sm text-accent">
          {CROP_SAVE_FAILURE}
          <Button variant="ghost" size="sm" onClick={handleRetryCrop}>
            Retry
          </Button>
        </p>
      )}

      <SwatchStrip
        colors={draft.colors}
        roleMap={draft.roleMap}
        degraded={degradedFor(draft.colors)}
        sourceImageUrl={sourceUrl}
        sourceIntrinsic={intrinsic}
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
