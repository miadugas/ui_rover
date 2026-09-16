import type { ReactNode } from 'react'

export interface FieldInputProps {
  id: string
  'aria-invalid': boolean
  'aria-describedby': string | undefined
}

export interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  className?: string
  children: (inputProps: FieldInputProps) => ReactNode
}

export function Field({ id, label, hint, error, className = '', children }: FieldProps) {
  const hintId = hint && !error ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="label-mono text-chrome-600">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-chrome-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-accent" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
