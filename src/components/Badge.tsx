import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent'

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-chrome-100 text-chrome-700 border border-chrome-200',
  accent: 'bg-accent/10 text-accent border border-accent/30',
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`label-mono inline-flex items-center gap-1 rounded-block px-1.5 py-0.5 ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
