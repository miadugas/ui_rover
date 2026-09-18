import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '../../components/Badge'
import { Field } from '../../components/Field'
import { findByUrl } from '../../lib/db'
import { PLATFORM_LABEL } from '../../lib/platform'
import { parsePostUrl } from '../../lib/url'
import type { ParsedPostUrl } from '../../types'

const DUPLICATE_DEBOUNCE_MS = 200

export const INVALID_URL_MESSAGE = 'Not an Instagram or Threads post URL'

export interface UrlFieldChange {
  raw: string
  parsed: ParsedPostUrl | null
  duplicateId: string | null
}

export interface UrlFieldProps {
  id?: string
  value: string
  onChange: (change: UrlFieldChange) => void
  disabled?: boolean
}

interface DuplicateHit {
  /** The normalized URL this lookup answered for, so a stale hit never shows. */
  url: string
  id: string
}

export function UrlField({ id = 'capture-url', value, onChange, disabled }: UrlFieldProps) {
  const parsed = useMemo(() => parsePostUrl(value), [value])
  const [duplicate, setDuplicate] = useState<DuplicateHit | null>(null)
  const normalizedUrl = parsed?.normalizedUrl ?? null
  const duplicateId = duplicate && duplicate.url === normalizedUrl ? duplicate.id : null

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!normalizedUrl) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      findByUrl(normalizedUrl)
        .then((existing) => {
          if (cancelled || !existing) return
          setDuplicate({ url: normalizedUrl, id: existing.id })
        })
        .catch(() => undefined)
    }, DUPLICATE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [normalizedUrl])

  useEffect(() => {
    onChangeRef.current({ raw: value, parsed, duplicateId })
  }, [value, parsed, duplicateId])

  const showError = value.trim().length > 0 && !parsed

  return (
    <Field
      id={id}
      label="Post URL (optional)"
      hint="Instagram /p/ or /reel/, or a Threads post"
      error={showError ? INVALID_URL_MESSAGE : undefined}
    >
      {(inputProps) => (
        <div className="flex items-center gap-2">
          <input
            {...inputProps}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={value}
            placeholder="https://instagram.com/p/…"
            onChange={(event) => {
              const raw = event.target.value
              onChangeRef.current({ raw, parsed: parsePostUrl(raw), duplicateId: null })
            }}
            className="w-full rounded-block border border-chrome-300 bg-chrome-0 px-2.5 py-2 text-sm text-chrome-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
          {parsed && <Badge tone="accent">{PLATFORM_LABEL[parsed.platform]}</Badge>}
          {duplicateId && (
            <Link
              to={`/entry/${duplicateId}`}
              className="label-mono whitespace-nowrap text-accent underline"
            >
              Already saved — open it
            </Link>
          )}
        </div>
      )}
    </Field>
  )
}
