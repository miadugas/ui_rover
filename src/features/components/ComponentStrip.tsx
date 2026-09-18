/**
 * Components captured from a design entry, shown on that entry's page (plan §5).
 *
 * Reads its own children rather than taking them as a prop: a capture or a
 * delete anywhere in the app emits a change, and the strip re-reads from the
 * same source of truth the library grid uses.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/Button'
import { deleteEntry, listChildren, subscribe } from '../../lib/db'
import { entryTitle } from '../../lib/platform'
import type { Entry } from '../../types'
import { useThumbUrl } from '../library/useThumbUrl'
import { COMPONENT_TAG_LABELS } from './componentTags'

const REMOVE_FAILURE = "Couldn't remove this component — try again"

const MAX_VISIBLE_CHIPS = 3

export interface ComponentStripProps {
  parent: Entry
  focusId?: string | null
}

function accessibleName(child: Entry, parent: Entry): string {
  const tags = child.componentTags ?? []
  const description = tags.length > 0 ? tags.join(', ') : 'untagged'

  return `component: ${description} — from ${entryTitle(parent)}`
}

function ComponentCard({
  child,
  parent,
  shouldFocus,
}: {
  child: Entry
  parent: Entry
  shouldFocus: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const thumbUrl = useThumbUrl(child.images[0]?.id, true)
  const chips = (child.componentTags ?? []).slice(0, MAX_VISIBLE_CHIPS)

  useEffect(() => {
    if (!shouldFocus) return

    linkRef.current?.focus()
  }, [shouldFocus])

  async function handleRemove() {
    setRemoving(true)
    setRemoveError(null)

    try {
      await deleteEntry(child.id)
    } catch {
      setRemoveError(REMOVE_FAILURE)
      setRemoving(false)
    }
  }

  return (
    <li className="wire flex w-40 flex-col gap-2 rounded-block p-2">
      <Link
        ref={linkRef}
        to={`/entry/${child.id}`}
        aria-label={accessibleName(child, parent)}
        className="flex flex-col gap-2 rounded-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="h-20 w-full rounded-block bg-chrome-50 object-contain"
          />
        ) : (
          <span className="wire flex h-20 items-center justify-center rounded-block">
            <span className="label-mono text-chrome-400">no thumb</span>
          </span>
        )}
        <span className="flex flex-wrap gap-1">
          {chips.length > 0 ? (
            chips.map((tag) => (
              <span
                key={tag}
                className="label-mono rounded-block border border-chrome-200 px-1 py-0.5 text-chrome-600"
              >
                {COMPONENT_TAG_LABELS[tag]}
              </span>
            ))
          ) : (
            <span className="label-mono text-chrome-400">untagged</span>
          )}
        </span>
      </Link>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-1" aria-busy={removing}>
          <Button size="sm" onClick={() => void handleRemove()} disabled={removing}>
            Confirm remove
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
            disabled={removing}
          >
            Keep
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => setConfirming(true)}
        >
          Remove
        </Button>
      )}

      {removeError && (
        <p role="alert" className="text-xs text-accent">
          {removeError}
        </p>
      )}
    </li>
  )
}

export function ComponentStrip({ parent, focusId }: ComponentStripProps) {
  const [children, setChildren] = useState<Entry[]>([])
  const parentId = parent.id

  useEffect(() => {
    let cancelled = false

    const load = () =>
      listChildren(parentId)
        .then((loaded) => {
          if (cancelled) return
          setChildren(loaded)
        })
        .catch(() => undefined)

    const unsubscribe = subscribe(() => {
      void load()
    })
    void load()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [parentId])

  if (children.length === 0) return null

  return (
    <section aria-label="Components" className="flex flex-col gap-2">
      <h2 className="label-mono text-chrome-600">Components ({children.length})</h2>
      <ul className="flex flex-wrap gap-2">
        {children.map((child) => (
          <ComponentCard
            key={child.id}
            child={child}
            parent={parent}
            shouldFocus={child.id === focusId}
          />
        ))}
      </ul>
    </section>
  )
}
