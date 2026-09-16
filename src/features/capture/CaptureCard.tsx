import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ulid } from 'ulid'
import { Button } from '../../components/Button'
import { createEntry } from '../../lib/db'
import { extract } from '../palette/extract'
import type { Entry, ExtractResult, ImageRecord, Kind, ParsedPostUrl } from '../../types'
import { ImageTray } from './ImageTray'
import { KindToggle } from './KindToggle'
import { UrlField } from './UrlField'
import { useImageIntake } from './useImageIntake'

export const EXTRACTION_WARNING = "Couldn't read colors from that image — saved as a design"

const SAVE_ERROR = 'Could not save this entry. Nothing was lost — try again.'

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

  const trayHeadingRef = useRef<HTMLHeadingElement>(null)
  const imageCountRef = useRef(0)

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
    let extraction: ExtractResult | null = null
    let extractionFailed = false

    if (kind === 'palette') {
      try {
        extraction = await extract(intake.images[sourceIdx].blob)
      } catch {
        savedKind = 'design'
        extractionFailed = true
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
      ...(extraction
        ? {
            sourceImageId: records[sourceIdx].id,
            colors: extraction.colors,
            roleMap: extraction.roleMap,
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
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {saveError && (
          <p className="text-xs text-accent" role="alert">
            {saveError}
          </p>
        )}
      </div>
    </div>
  )
}
