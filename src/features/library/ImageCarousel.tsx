import type { KeyboardEvent } from 'react'
import { useImageUrl } from '../palette/useImageUrl'
import type { ImageRef } from '../../types'

export interface ImageCarouselProps {
  images: ImageRef[]
  sourceImageId?: string
  selectedId: string
  onSelect: (imageId: string) => void
  disabled?: boolean
}

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

function Thumb({
  image,
  index,
  isSource,
  selected,
  disabled,
  onSelect,
  onKeyDown,
}: {
  image: ImageRef
  index: number
  isSource: boolean
  selected: boolean
  disabled: boolean
  onSelect: (imageId: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const url = useImageUrl(image.id)

  return (
    <button
      type="button"
      role="tab"
      id={`carousel-tab-${image.id}`}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      aria-controls="carousel-panel"
      disabled={disabled}
      tabIndex={disabled ? -1 : selected ? 0 : -1}
      onClick={() => onSelect(image.id)}
      onKeyDown={onKeyDown}
      className={[
        'relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-block border',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        selected ? 'border-chrome-900' : 'border-chrome-300',
      ].join(' ')}
    >
      {url ? (
        <img src={url} alt={`Screenshot ${index + 1}`} className="h-full w-full object-cover" />
      ) : (
        <span className="label-mono text-chrome-400">{index + 1}</span>
      )}
      {isSource && (
        <span className="label-mono absolute bottom-0 left-0 right-0 bg-chrome-900/80 text-center text-chrome-0">
          source
        </span>
      )}
    </button>
  )
}

function LargeView({ imageId, index }: { imageId: string; index: number }) {
  const url = useImageUrl(imageId)

  if (!url) {
    return (
      <div className="wire flex h-64 items-center justify-center rounded-block">
        <span className="label-mono text-chrome-400">loading</span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={`Screenshot ${index + 1}`}
      className="max-h-[28rem] w-full rounded-block object-contain"
    />
  )
}

export function ImageCarousel({
  images,
  sourceImageId,
  selectedId,
  onSelect,
  disabled = false,
}: ImageCarouselProps) {
  if (images.length === 0) return null

  const selectedIndex = Math.max(
    0,
    images.findIndex((image) => image.id === selectedId),
  )

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return

    const step = ARROW_STEP[event.key]
    if (step === undefined) return

    event.preventDefault()
    const next = images[(selectedIndex + step + images.length) % images.length]
    onSelect(next.id)
    document.getElementById(`carousel-tab-${next.id}`)?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="tablist"
        aria-label="Screenshots"
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        className="flex flex-wrap gap-2"
      >
        {images.map((image, index) => (
          <Thumb
            key={image.id}
            image={image}
            index={index}
            isSource={image.id === sourceImageId}
            selected={image.id === images[selectedIndex].id}
            disabled={disabled}
            onSelect={onSelect}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>
      <div
        role="tabpanel"
        id="carousel-panel"
        aria-labelledby={`carousel-tab-${images[selectedIndex].id}`}
      >
        <LargeView imageId={images[selectedIndex].id} index={selectedIndex} />
      </div>
    </div>
  )
}
