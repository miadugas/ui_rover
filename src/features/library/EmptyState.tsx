import { Link } from 'react-router'
import { Button } from '../../components/Button'

export type EmptyStateVariant = 'empty' | 'no-results'

export interface EmptyStateProps {
  variant: EmptyStateVariant
  onClear?: () => void
}

export function EmptyState({ variant, onClear }: EmptyStateProps) {
  if (variant === 'empty') {
    return (
      <div className="wire flex flex-col items-center gap-3 rounded-block p-8 text-center">
        <p className="text-sm text-chrome-600">No posts yet.</p>
        <Link
          to="/"
          className="label-mono rounded-block border border-chrome-300 px-3 py-1.5 text-chrome-800 transition-colors hover:bg-chrome-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Paste your first post
        </Link>
      </div>
    )
  }

  return (
    <div className="wire flex flex-col items-center gap-3 rounded-block p-8 text-center">
      <p className="text-sm text-chrome-600">Nothing matches these filters.</p>
      <Button variant="secondary" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}
