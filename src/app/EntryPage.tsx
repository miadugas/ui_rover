import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DeviceFrame } from '../features/library/DeviceFrame'
import { ImageCarousel } from '../features/library/ImageCarousel'
import { NoteField } from '../features/library/NoteField'
import { TagEditor } from '../features/library/TagEditor'
import { MockPanel } from '../features/palette/mock/MockPanel'
import { readProgressLabel } from '../features/palette/read/readProgressLabel'
import { readPalette } from '../features/palette/read/readPalette'
import type { ReadResult } from '../features/palette/read/readPalette'
import {
  ReadCancelledError,
  createReadController,
} from '../features/palette/read/readProgress'
import type {
  ReadController,
  ReadProgress,
} from '../features/palette/read/readProgress'
import { useImageBlob, useImageUrl } from '../features/palette/useImageUrl'
import { deleteEntry, getEntry, subscribe, updateEntry } from '../lib/db'
import { PLATFORM_LABEL } from '../lib/platform'
import { useDebouncedPatch } from '../lib/useDebouncedPatch'
import type { Entry } from '../types'

const EXTRACT_FAILURE = "Couldn't read colors from that image"

const SAVE_FAILURE = "Couldn't save changes —"

const DELETE_FAILURE = "Couldn't delete this entry — try again"

function formatCreatedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function hasPalette(entry: Entry): boolean {
  return Boolean(entry.roleMap && entry.colors && entry.colors.length > 0)
}

function readNotice(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null

  const { notice } = state as { notice?: unknown }
  return typeof notice === 'string' ? notice : null
}

function readFocusHeading(state: unknown): boolean {
  if (!state || typeof state !== 'object') return false

  return (state as { focusHeading?: unknown }).focusHeading === true
}

function readPendingRead(state: unknown): ReadResult | null {
  if (!state || typeof state !== 'object') return null

  const { pendingRead } = state as { pendingRead?: unknown }
  if (!pendingRead || typeof pendingRead !== 'object') return null

  return pendingRead as ReadResult
}

/** Everything Save (or a first extract) hands over, held outside the history. */
interface Handoff {
  notice: string | null
  focusHeading: boolean
  pendingRead: ReadResult | null
}

function EntryView({ entry }: { entry: Entry }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { queue, flush, retry, error: saveError } = useDebouncedPatch(entry.id)
  const [tags, setTags] = useState(entry.tags)
  const [note, setNote] = useState(entry.note)
  const [selectedId, setSelectedId] = useState(
    entry.sourceImageId ?? entry.images[0]?.id ?? '',
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [extractError, setExtractError] = useState<string>()
  const [extracting, setExtracting] = useState(false)
  const [readPhase, setReadPhase] = useState<ReadProgress | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const readControllerRef = useRef<ReadController | null>(null)
  // Router state is read exactly once, on mount, and then erased from history:
  // a `pendingRead` that survived Back or a reload would offer an Apply that
  // silently overwrites everything edited since.
  const [handoff, setHandoff] = useState<Handoff>(() => ({
    notice: readNotice(location.state),
    focusHeading: readFocusHeading(location.state),
    pendingRead: readPendingRead(location.state),
  }))

  const sourceId = entry.sourceImageId ?? entry.images[0]?.id
  const sourceBlob = useImageBlob(sourceId)
  const sourceUrl = useImageUrl(sourceId)
  const selectedBlob = useImageBlob(selectedId)
  const selectedUrl = useImageUrl(selectedId)

  const { notice, focusHeading, pendingRead } = handoff
  const hasRouterState = location.state !== null && location.state !== undefined
  const showMock = entry.kind === 'palette' || hasPalette(entry)
  const showDesignTools = entry.kind === 'design'
  // Once a design has colors the MockPanel owns every palette write, including
  // re-extraction — two owners for the same fields would race.
  const showFirstExtract = showDesignTools && !hasPalette(entry)

  // Save navigates here and hands over `focusHeading`, so the landing point is
  // the entry itself rather than the top of the document. Ordinary navigation
  // and reloads carry no such state and are left alone.
  useEffect(() => {
    if (!focusHeading) return

    headingRef.current?.focus()
  }, [entry.id, focusHeading])

  // One replace clears the notice, the focus flag and the pending read together
  // — they all now live in `handoff`.
  useEffect(() => {
    if (!hasRouterState) return

    void navigate(location.pathname, { replace: true, state: null })
  }, [hasRouterState, location.pathname, navigate])

  function handleDismissNotice() {
    setHandoff((previous) => ({ ...previous, notice: null }))
  }

  function handleTagsChange(next: string[]) {
    setTags(next)
    queue({ tags: next, updatedAt: Date.now() })
  }

  function handleNoteChange(next: string) {
    setNote(next)
    queue({ note: next, updatedAt: Date.now() })
  }

  // `MockPanel` is not mounted yet on a palette-less design, so the first read
  // runs here and hands its result to the panel it is about to mount — the same
  // hand-off Capture makes through router state, minus the router.
  async function handleExtract() {
    if (!selectedBlob) {
      setExtractError(EXTRACT_FAILURE)
      return
    }

    const controller = createReadController()
    readControllerRef.current = controller
    setExtracting(true)
    setReadPhase({ phase: 'idle' })

    try {
      const result = await readPalette(selectedBlob, {
        sourceImageId: selectedId,
        onProgress: setReadPhase,
        signal: controller.signal,
      })
      await updateEntry(entry.id, {
        sourceImageId: selectedId,
        colors: result.colors,
        roleMap: result.roleMap,
        blockOverrides: {},
        mockTemplate: entry.mockTemplate ?? 'ecommerce',
        paletteSource: result.source,
        updatedAt: Date.now(),
      })
      setExtractError(undefined)
      setHandoff((previous) => ({ ...previous, pendingRead: result }))
    } catch (error) {
      if (!(error instanceof ReadCancelledError)) setExtractError(EXTRACT_FAILURE)
    } finally {
      readControllerRef.current = null
      setReadPhase(null)
      setExtracting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(undefined)

    try {
      await deleteEntry(entry.id)
    } catch {
      setDeleteError(DELETE_FAILURE)
      return
    } finally {
      setDeleting(false)
    }

    void navigate('/library')
  }

  return (
    <article className="flex flex-col gap-6">
      {notice && (
        <div
          role="status"
          className="wire flex items-center justify-between gap-2 rounded-block p-2"
        >
          <p className="text-xs text-chrome-600">{notice}</p>
          <Button variant="ghost" size="sm" onClick={handleDismissNotice}>
            Dismiss
          </Button>
        </div>
      )}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{PLATFORM_LABEL[entry.platform]}</Badge>
          <Badge tone="accent">{entry.kind}</Badge>
          <span className="text-xs text-chrome-500">{formatCreatedAt(entry.createdAt)}</span>
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-mono text-lg font-semibold text-chrome-900"
        >
          {entry.shortcode}
        </h1>
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent underline underline-offset-2"
        >
          Open original post
        </a>
      </header>

      <ImageCarousel
        images={entry.images}
        sourceImageId={entry.sourceImageId}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {showDesignTools && (
        <section aria-label="Design" className="flex flex-col gap-3">
          <DeviceFrame src={selectedUrl} alt={`Screenshot of ${entry.shortcode}`} />
          {showFirstExtract && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void handleExtract()}
                disabled={extracting || !selectedBlob}
              >
                {readPhase ? readProgressLabel(readPhase) : 'Extract palette'}
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
              {extractError && (
                <p role="alert" className="text-sm text-accent">
                  {extractError}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {showMock && (
        <MockPanel
          entry={entry}
          sourceBlob={sourceBlob}
          sourceUrl={sourceUrl}
          selectedBlob={selectedBlob}
          selectedImageId={selectedId}
          pendingRead={pendingRead}
          onPendingReadConsumed={() =>
            setHandoff((previous) => ({ ...previous, pendingRead: null }))
          }
        />
      )}

      <TagEditor tags={tags} onChange={handleTagsChange} onBlur={() => void flush()} />
      <NoteField note={note} onChange={handleNoteChange} onBlur={() => void flush()} />

      {saveError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-accent">
          {SAVE_FAILURE}
          <Button variant="ghost" size="sm" onClick={() => void retry()}>
            Retry
          </Button>
        </p>
      )}

      <section aria-label="Danger zone" className="flex flex-col gap-2">
        {confirmingDelete ? (
          <div
            aria-busy={deleting}
            className="wire flex flex-wrap items-center gap-2 rounded-block p-3"
          >
            <p className="text-sm text-chrome-700">Delete this entry? This cannot be undone.</p>
            <Button size="sm" onClick={() => void handleDelete()}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            {deleteError && (
              <p role="alert" className="text-sm text-accent">
                {deleteError}
              </p>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Button>
        )}
      </section>
    </article>
  )
}

export function EntryPage() {
  const { id } = useParams<{ id: string }>()
  const [entry, setEntry] = useState<Entry>()
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return

    let cancelled = false

    const load = () =>
      getEntry(id)
        .then((loaded) => {
          if (cancelled) return
          setEntry(loaded)
          setNotFound(loaded === undefined)
        })
        .catch(() => {
          if (!cancelled) setNotFound(true)
        })

    const unsubscribe = subscribe(() => {
      void load()
    })
    const initialLoadTimer = window.setTimeout(() => {
      void load()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(initialLoadTimer)
      unsubscribe()
    }
  }, [id])

  if (entry) return <EntryView key={entry.id} entry={entry} />

  if (!id || notFound) {
    return (
      <section className="flex flex-col items-start gap-3">
        <h1 className="text-xl font-semibold text-chrome-900">Entry not found</h1>
        <p className="text-sm text-chrome-600">
          It may have been deleted, or the link points at another device's library.
        </p>
        <Link to="/library" className="text-sm text-accent underline underline-offset-2">
          Back to the library
        </Link>
      </section>
    )
  }

  return (
    <p role="status" className="label-mono text-chrome-500">
      loading entry
    </p>
  )
}
