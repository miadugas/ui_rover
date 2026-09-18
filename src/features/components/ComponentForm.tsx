/**
 * Tagging step of the component capture flow (plan §5 `ComponentForm`).
 *
 * The crop rect is already fixed by this point; the form owns only the tag /
 * note draft and hands it back on Save. Saving with zero chips is allowed —
 * only the rect is required.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { chipClassName } from '../../components/chipStyles'
import { NoteField } from '../library/NoteField'
import { TagEditor } from '../library/TagEditor'
import { COMPONENT_TAG_LABELS, orderedComponentTags } from './componentTags'
import type { ComponentTag } from '../../types'

export interface ComponentFormValues {
  componentTags: ComponentTag[]
  tags: string[]
  note: string
}

export interface ComponentFormProps {
  previewUrl: string | null
  initialTags?: ComponentTag[]
  saving: boolean
  error: string | null
  onSave: (values: ComponentFormValues) => void
  onBack: () => void
  onCancel: () => void
}

export function ComponentForm({
  previewUrl,
  initialTags = [],
  saving,
  error,
  onSave,
  onBack,
  onCancel,
}: ComponentFormProps) {
  const [componentTags, setComponentTags] = useState<ComponentTag[]>(initialTags)
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const firstChipRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    firstChipRef.current?.focus()
  }, [])

  const toggleComponentTag = (tag: ComponentTag) => {
    setComponentTags((current) =>
      current.includes(tag)
        ? current.filter((candidate) => candidate !== tag)
        : [...current, tag],
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Component crop preview"
          className="wire max-h-48 w-full rounded-block bg-chrome-50 object-contain"
        />
      ) : (
        <div className="wire flex max-h-48 items-center justify-center rounded-block bg-chrome-50 px-2 py-8">
          <span className="label-mono text-chrome-500">No preview</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="label-mono text-chrome-600">Component type</span>
        <div role="group" aria-label="Component type" className="flex flex-wrap gap-1">
          {orderedComponentTags().map((tag, idx) => {
            const pressed = componentTags.includes(tag)
            return (
              <button
                key={tag}
                ref={idx === 0 ? firstChipRef : undefined}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggleComponentTag(tag)}
                className={chipClassName(pressed)}
              >
                {COMPONENT_TAG_LABELS[tag]}
              </button>
            )
          })}
        </div>
      </div>

      <TagEditor tags={tags} onChange={setTags} id="component-tag-editor" />
      <NoteField note={note} onChange={setNote} id="component-note-field" />

      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={saving}
          aria-busy={saving}
          onClick={() => onSave({ componentTags, tags, note })}
        >
          Save
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onBack}>
          Back to crop
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
