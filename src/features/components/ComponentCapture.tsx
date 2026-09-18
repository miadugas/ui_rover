/**
 * Crop → tag → save orchestration for a component capture (plan §5).
 *
 * The rect lives here and nowhere else: `CropTool`'s `onChange` only updates
 * this component's state, so the parent entry's palette `crop` — owned by
 * `MockPanel` — is never written during a capture.
 */
import { useEffect, useState } from 'react'
import { ulid } from 'ulid'
import { createEntry } from '../../lib/db'
import type { Entry, ImageRecord, ImageRef, NormalizedRect } from '../../types'
import { CropTool } from '../palette/read/CropTool'
import { ComponentForm } from './ComponentForm'
import type { ComponentFormValues } from './ComponentForm'
import { ComponentTooLargeError, cropComponent } from './cropComponent'
import type { ComponentCrop } from './cropComponent'

const TOO_LARGE_FAILURE = 'Crop is too large — draw a smaller area'

const CROP_FAILURE = "Couldn't crop that image — try again"

const SAVE_FAILURE = "Couldn't save this component — try again"

interface CropPreview {
  crop: ComponentCrop
  previewUrl: string
}

export interface ComponentCaptureProps {
  parent: Entry
  imageId: string
  imageUrl: string
  imageBlob: Blob
  intrinsic: { width: number; height: number }
  onDone: (newEntryId: string | null) => void
}

export function ComponentCapture({
  parent,
  imageId,
  imageUrl,
  imageBlob,
  intrinsic,
  onDone,
}: ComponentCaptureProps) {
  const [captureTarget] = useState(() => ({
    imageId,
    imageUrl,
    imageBlob,
    intrinsic,
  }))
  const [rect, setRect] = useState<NormalizedRect | null>(null)
  const [crop, setCrop] = useState<CropPreview | null>(null)
  const [cropError, setCropError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
  const [saving, setSaving] = useState(false)

  // The URL is minted next to the crop it previews and revoked by the one
  // effect that watches that pair, so Back to crop, a second confirm and an
  // unmount all release it exactly once.
  useEffect(() => {
    if (!crop) return

    return () => URL.revokeObjectURL(crop.previewUrl)
  }, [crop])

  async function handleConfirm() {
    if (!rect || cropping) return

    setCropping(true)
    setCropError(null)

    try {
      const cropped = await cropComponent(captureTarget.imageBlob, rect)
      setCrop({ crop: cropped, previewUrl: URL.createObjectURL(cropped.blob) })
    } catch (error) {
      setCropError(
        error instanceof ComponentTooLargeError ? TOO_LARGE_FAILURE : CROP_FAILURE,
      )
    } finally {
      setCropping(false)
    }
  }

  async function handleSave(values: ComponentFormValues) {
    if (!crop || !rect) return

    setSaving(true)
    setSaveError(null)

    const entryId = ulid()
    const createdAt = Date.now()
    const image: ImageRef = {
      id: ulid(),
      order: 0,
      width: crop.crop.width,
      height: crop.crop.height,
      mime: crop.crop.mime,
    }
    const componentEntry: Entry = {
      id: entryId,
      kind: 'component',
      parentId: parent.id,
      parentImageId: captureTarget.imageId,
      sourceRect: rect,
      images: [image],
      sourceImageId: image.id,
      componentTags: values.componentTags,
      tags: values.tags,
      note: values.note,
      createdAt,
      updatedAt: createdAt,
    }
    const record: ImageRecord = {
      ...image,
      entryId,
      blob: crop.crop.blob,
      thumb: crop.crop.thumb,
    }

    try {
      await createEntry(componentEntry, [record])
    } catch {
      setSaveError(SAVE_FAILURE)
      return
    } finally {
      setSaving(false)
    }

    onDone(entryId)
  }

  return (
    <section aria-label="Capture component" className="flex flex-col gap-3">
      {crop ? (
        <ComponentForm
          previewUrl={crop.previewUrl}
          saving={saving}
          error={saveError}
          onSave={(values) => void handleSave(values)}
          onBack={() => setCrop(null)}
          onCancel={() => onDone(null)}
        />
      ) : (
        <>
          <CropTool
            imageUrl={captureTarget.imageUrl}
            intrinsic={captureTarget.intrinsic}
            value={rect}
            onChange={setRect}
            onConfirm={() => void handleConfirm()}
            onCancel={() => onDone(null)}
          />
          {cropError && (
            <p role="alert" className="text-xs text-accent">
              {cropError}
            </p>
          )}
        </>
      )}
    </section>
  )
}
