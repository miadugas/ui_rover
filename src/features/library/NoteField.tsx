export interface NoteFieldProps {
  note: string
  onChange: (note: string) => void
  onBlur?: () => void
  id?: string
}

export function NoteField({ note, onChange, onBlur, id = 'note-field' }: NoteFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="label-mono text-chrome-600">
        Note
      </label>
      <textarea
        id={id}
        value={note}
        rows={4}
        placeholder="what made this worth keeping"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="w-full rounded-block border border-chrome-300 bg-chrome-0 px-2 py-1.5 text-sm text-chrome-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
    </div>
  )
}
