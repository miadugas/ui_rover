import type { RefObject } from 'react'
import { Button } from '../../components/Button'
import type { Kind } from '../../types'
import type { RejectionReason } from './imageLimits'
import { MAX_IMAGES_PER_ENTRY } from './imageLimits'
import type { DropZoneProps, PendingImage, PickerInputProps, Rejection } from './useImageIntake'

export const DROP_HINT = 'Paste a screenshot (⌘V), drop it here, or choose files'

const REJECTION_TEXT: Record<RejectionReason, string> = {
  'not-image': 'Copy the image, not the link',
  'too-large': 'Too big — each image has to be under 12 MB',
  'too-many': `Too many — ${MAX_IMAGES_PER_ENTRY} images per entry is the limit`,
}

export interface ImageTrayProps {
  images: PendingImage[]
  rejections: Rejection[]
  dropZoneProps: DropZoneProps
  pickerInputProps: PickerInputProps
  openPicker: () => void
  onRemove: (tempId: string) => void
  onMove: (tempId: string, direction: 'up' | 'down') => void
  onDismissRejections: () => void
  kind: Kind
  sourceTempId: string | null
  onSourceChange: (tempId: string) => void
  headingRef?: RefObject<HTMLHeadingElement | null>
}

export function ImageTray({
  images,
  rejections,
  dropZoneProps,
  pickerInputProps,
  openPicker,
  onRemove,
  onMove,
  onDismissRejections,
  kind,
  sourceTempId,
  onSourceChange,
  headingRef,
}: ImageTrayProps) {
  const activeSourceTempId = images.some((image) => image.tempId === sourceTempId)
    ? sourceTempId
    : (images[0]?.tempId ?? null)

  return (
    <section className="flex flex-col gap-2" aria-labelledby="capture-tray-heading">
      <h2
        id="capture-tray-heading"
        ref={headingRef}
        tabIndex={-1}
        className="label-mono text-chrome-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Screenshots ({images.length})
      </h2>

      <div
        {...dropZoneProps}
        className="wire flex flex-col items-center gap-2 rounded-block px-4 py-6 text-center"
      >
        <p className="text-sm text-chrome-500">{DROP_HINT}</p>
        <Button variant="secondary" size="sm" onClick={openPicker}>
          Choose files
        </Button>
        <input {...pickerInputProps} aria-hidden="true" tabIndex={-1} />
      </div>

      {rejections.length > 0 && (
        <div className="wire flex flex-col gap-1 rounded-block p-2" role="alert">
          <ul className="flex flex-col gap-0.5 text-xs text-chrome-600">
            {rejections.map((rejection) => (
              <li key={rejection.id}>
                {rejection.fileName ? `${rejection.fileName}: ` : ''}
                {REJECTION_TEXT[rejection.reason]}
              </li>
            ))}
          </ul>
          <div>
            <Button variant="ghost" size="sm" onClick={onDismissRejections}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, idx) => (
            <li
              key={image.tempId}
              className="flex flex-col gap-1 rounded-block border border-chrome-200 p-2"
            >
              <img
                src={image.objectUrl}
                alt={`Screenshot ${idx + 1}`}
                className="h-24 w-full rounded-block object-cover"
              />
              <div className="flex items-center justify-between gap-1">
                <span className="label-mono text-chrome-500">#{idx + 1}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={idx === 0}
                    aria-label={`Move screenshot ${idx + 1} up`}
                    onClick={() => onMove(image.tempId, 'up')}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={idx === images.length - 1}
                    aria-label={`Move screenshot ${idx + 1} down`}
                    onClick={() => onMove(image.tempId, 'down')}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove screenshot ${idx + 1}`}
                    onClick={() => onRemove(image.tempId)}
                  >
                    ×
                  </Button>
                </div>
              </div>
              {kind === 'palette' && (
                <label className="flex items-center gap-1.5 text-xs text-chrome-600">
                  <input
                    type="radio"
                    name="capture-source-image"
                    value={image.tempId}
                    checked={image.tempId === activeSourceTempId}
                    onChange={() => onSourceChange(image.tempId)}
                  />
                  Source
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
