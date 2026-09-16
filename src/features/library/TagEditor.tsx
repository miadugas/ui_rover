import { useState } from 'react'
import type { KeyboardEvent } from 'react'

export interface TagEditorProps {
  tags: string[]
  onChange: (tags: string[]) => void
  onBlur?: () => void
  id?: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function TagEditor({ tags, onChange, onBlur, id = 'tag-editor' }: TagEditorProps) {
  const [draft, setDraft] = useState('')

  function addDraft() {
    const tag = normalize(draft)
    setDraft('')

    if (!tag || tags.includes(tag)) return
    onChange([...tags, tag])
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addDraft()
      return
    }

    if (event.key !== 'Backspace' || draft !== '' || tags.length === 0) return
    event.preventDefault()
    onChange(tags.slice(0, -1))
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="label-mono text-chrome-600">
        Tags
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-block border border-chrome-300 bg-chrome-0 p-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="label-mono inline-flex items-center gap-1 rounded-block bg-chrome-100 px-1.5 py-0.5 text-chrome-700"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(tags.filter((candidate) => candidate !== tag))}
              className="cursor-pointer text-chrome-500 hover:text-chrome-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder="add a tag"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            addDraft()
            onBlur?.()
          }}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm text-chrome-800 outline-none"
        />
      </div>
    </div>
  )
}
