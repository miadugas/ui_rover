import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ulid } from 'ulid'
import { Button } from '../../components/Button'
import { createEntry } from '../../lib/db'
import { extract } from '../palette/extract'
import { readProgressLabel } from '../palette/read/readProgressLabel'
import { readPalette } from '../palette/read/readPalette'
import type { ReadResult } from '../palette/read/readPalette'
import { ReadCancelledError, createReadController } from '../palette/read/readProgress'
import type { ReadController, ReadProgress } from '../palette/read/readProgress'
import type {
  Entry,
  ImageRecord,
  Kind,
  PaletteSource,
  ParsedPostUrl,
  RoleMap,
} from '../../types'
import { ImageTray } from './ImageTray'
import { KindToggle } from './KindToggle'
import { UrlField } from './UrlField'
import { useImageIntake } from './useImageIntake'

interface SavedPalette {
  colors: string[]
  roleMap: RoleMap
  source: PaletteSource
}

export const EXTRACTION_WARNING = "Couldn't read colors from that image — saved as a design"

const SAVE_ERROR = 'Could not save this entry. Nothing was lost — try again.'

function saveLabel(phase: ReadProgress | null): string {
  return phase ? readProgressLabel(phase) : 'Saving…'
}

async function quantizeFallback(
  error: unknown,
  blob: Blob,
): Promise<SavedPalette | null> {
  if (!(error instanceof ReadCancelledError)) return null

  try {
    const quantized = await extract(blob)
    return {
      colors: quantized.colors,
      roleMap: quantized.roleMap,
      source: 'quantize',
    }
  } catch {
    return null
  }
}

export function CaptureCard() {
  const navigate = useNavigate()
  const intake = useImageIntake()

  const [url, setUrl] = useState('')
  const [parsed, setParsed] = useState<ParsedPostUrl | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('palette')
  const [sourceTempId, setSourceTempId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [readPhase, setReadPhase] = useState<ReadProgress | null>(null)

  const trayHeadingRef = useRef<HTMLHeadingElement>(null)
  const imageCountRef = useRef(0)
  const readControllerRef = useRef<ReadController | null>(null)

  useEffect(() => {
    const previousCount = imageCountRef.current
    imageCountRef.current = intake.images.length
    if (intake.images.length > previousCount) trayHeadingRef.current?.focus()
  }, [intake.images.length])

  const canSave = Boolean(parsed) && !duplicateId && intake.images.length > 0 && !saving

  const handleSave = async () => {
    if (!parsed || !canSave) return

    setSaving(true)
    setSaveError(null)

    const entryId = ulid()
    const records: ImageRecord[] = intake.images.map((image, order) => ({
      id: ulid(),
      entryId,
      order,
      width: image.width,
      height: image.height,
      mime: image.mime,
      blob: image.blob,
      thumb: image.thumb,
    }))

    const requestedSourceIdx = intake.images.findIndex((image) => image.tempId === sourceTempId)
    const sourceIdx = requestedSourceIdx < 0 ? 0 : requestedSourceIdx

    let savedKind = kind
    let palette: SavedPalette | null = null
    let readResult: ReadResult | null = null
    let extractionFailed = false

    if (kind === 'palette') {
      const sourceBlob = intake.images[sourceIdx].blob
      const controller = createReadController()
      readControllerRef.current = controller

      try {
        readResult = await readPalette(sourceBlob, {
          sourceImageId: records[sourceIdx].id,
          onProgress: setReadPhase,
          signal: controller.signal,
        })
        palette = {
          colors: readResult.colors,
          roleMap: readResult.roleMap,
          source: readResult.source,
        }
      } catch (error) {
        // Cancelling the read must not cost her the entry, so Capture — and
        // only Capture — falls back to the plain quantize pass.
        palette = await quantizeFallback(error, sourceBlob)
        if (!palette) {
          savedKind = 'design'
          extractionFailed = true
        }
      } finally {
        readControllerRef.current = null
        setReadPhase(null)
      }
    }

    const now = Date.now()
    const entry: Entry = {
      id: entryId,
      url: parsed.normalizedUrl,
      platform: parsed.platform,
      ...(parsed.author ? { author: parsed.author } : {}),
      shortcode: parsed.shortcode,
      kind: savedKind,
      images: records.map(({ id, order, width, height, mime }) => ({
        id,
        order,
        width,
        height,
        mime,
      })),
      ...(palette
        ? {
            sourceImageId: records[sourceIdx].id,
            colors: palette.colors,
            roleMap: palette.roleMap,
            paletteSource: palette.source,
            mockTemplate: 'ecommerce' as const,
          }
        : {}),
      tags: [],
      note: '',
      createdAt: now,
      updatedAt: now,
    }

    try {
      await createEntry(entry, records)
    } catch {
      setSaveError(SAVE_ERROR)
      setSaving(false)
      return
    }

    intake.clear()
    setUrl('')
    setParsed(null)
    setDuplicateId(null)
    setKind('palette')
    setSourceTempId(null)
    setSaving(false)
    navigate(`/entry/${entryId}`, {
      state: {
        ...(extractionFailed ? { notice: EXTRACTION_WARNING } : {}),
        focusHeading: true,
        ...(readResult ? { pendingRead: readResult } : {}),
      },
    })
  }

  return (
    <div className="flex flex-col gap-5 rounded-block border border-chrome-200 p-4" aria-busy={saving}>
      <UrlField
        value={url}
        disabled={saving}
        onChange={(change) => {
          setUrl(change.raw)
          setParsed(change.parsed)
          setDuplicateId(change.duplicateId)
        }}
      />

      <ImageTray
        images={intake.images}
        rejections={intake.rejections}
        dropZoneProps={intake.dropZoneProps}
        pickerInputProps={intake.pickerInputProps}
        openPicker={intake.openPicker}
        onRemove={intake.remove}
        onMove={intake.move}
        onDismissRejections={intake.dismissRejections}
        kind={kind}
        sourceTempId={sourceTempId}
        onSourceChange={setSourceTempId}
        headingRef={trayHeadingRef}
      />

      <KindToggle value={kind} onChange={setKind} disabled={saving} />

      <div className="flex items-center gap-3">
        <Button disabled={!canSave} onClick={() => void handleSave()}>
          {saving ? saveLabel(readPhase) : 'Save'}
        </Button>
        {readPhase && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => readControllerRef.current?.cancel()}
          >
            Cancel read
          </Button>
        )}
        {saveError && (
          <p className="text-xs text-accent" role="alert">
            {saveError}
          </p>
        )}
      </div>
    </div>
  )
}
