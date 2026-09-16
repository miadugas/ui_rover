import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '../../components/Badge'
import { PLATFORM_LABEL } from '../../lib/platform'
import type { Entry } from '../../types'
import { useThumbUrl } from './useThumbUrl'

const SWATCH_LIMIT = 6
const TAG_LIMIT = 3
const NOTE_EXCERPT_LENGTH = 80

function noteExcerpt(note: string): string {
  const trimmed = note.trim()
  if (trimmed.length <= NOTE_EXCERPT_LENGTH) return trimmed
  return `${trimmed.slice(0, NOTE_EXCERPT_LENGTH)}…`
}

/**
 * True once the element has been on screen. Environments without
 * IntersectionObserver (jsdom, older WebViews) are treated as always visible so
 * the grid degrades to eager thumbs rather than to blank cards.
 */
function useHasEnteredViewport(): [
  (node: HTMLElement | null) => void,
  boolean,
] {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const nodeRef = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    if (visible) return

    const node = nodeRef.current
    if (!node) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setVisible(true)
    })

    observer.observe(node)
    observerRef.current = observer

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [visible])

  const setNode = (node: HTMLElement | null) => {
    nodeRef.current = node
    if (!node) observerRef.current?.disconnect()
  }

  return [setNode, visible]
}

export interface EntryCardProps {
  entry: Entry
}

export function EntryCard({ entry }: EntryCardProps) {
  const [setNode, visible] = useHasEnteredViewport()
  const thumbUrl = useThumbUrl(entry.images[0]?.id, visible)

  const swatches = entry.colors?.slice(0, SWATCH_LIMIT) ?? []
  const tags = entry.tags.slice(0, TAG_LIMIT)
  const excerpt = noteExcerpt(entry.note)

  return (
    <Link
      ref={setNode}
      to={`/entry/${entry.id}`}
      className="flex flex-col gap-2 rounded-block border border-chrome-200 p-2 transition-colors hover:bg-chrome-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="wire aspect-4/5 w-full overflow-hidden rounded-block">
        {thumbUrl && (
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Badge>{PLATFORM_LABEL[entry.platform]}</Badge>
        <Badge tone="accent">{entry.kind}</Badge>
      </div>

      {swatches.length > 0 && (
        <div className="flex items-center gap-0.5">
          {swatches.map((hex, idx) => (
            <span
              key={`${hex}-${idx}`}
              role="img"
              aria-label={hex}
              className="h-3.5 w-3.5 rounded-xs border border-chrome-200"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="label-mono rounded-block bg-chrome-100 px-1.5 py-0.5 text-chrome-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {excerpt && <p className="text-xs text-chrome-600">{excerpt}</p>}
    </Link>
  )
}
