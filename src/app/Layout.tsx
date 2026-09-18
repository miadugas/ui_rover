import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { openDb, storageFallbackReason } from '../lib/db'
import type { StorageFallbackReason } from '../lib/db'

const NAV_ITEMS = [
  { to: '/', label: 'Capture', end: true },
  { to: '/library', label: 'Library', end: false },
] as const

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return [
    'label-mono rounded-block px-2 py-1 transition-colors',
    isActive ? 'bg-chrome-100 text-chrome-900' : 'text-chrome-500 hover:text-chrome-800',
  ].join(' ')
}

const STORAGE_BANNER_TEXT: Record<Exclude<StorageFallbackReason, 'none'>, string> = {
  unavailable: 'Storage unavailable — this session is in-memory only.',
  'upgrade-failed':
    'Storage upgrade failed — this session is in-memory; your saved entries are intact but not loaded.',
}

export interface StorageBannerProps {
  reason: StorageFallbackReason
}

export function StorageBanner({ reason }: StorageBannerProps) {
  if (reason === 'none') return null

  return (
    <div className="wire border-x-0 border-t-0 px-4 py-2 text-center text-xs text-chrome-600" role="status">
      {STORAGE_BANNER_TEXT[reason]}
    </div>
  )
}

export function Layout() {
  const [fallbackReason, setFallbackReason] = useState<StorageFallbackReason>('none')

  useEffect(() => {
    let cancelled = false

    // Deferred a tick so the probe's setState lands outside the effect body,
    // matching how useLibrary does its initial load.
    const timer = window.setTimeout(() => {
      openDb()
        .then(() => {
          if (!cancelled) setFallbackReason(storageFallbackReason())
        })
        .catch(() => {
          if (!cancelled) setFallbackReason('unavailable')
        })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-chrome-0 text-chrome-800">
      <header className="border-b border-chrome-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="font-mono text-sm font-semibold tracking-wide text-chrome-900">
            ui_rover
          </Link>
          <nav className="flex items-center gap-2" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClassName}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <StorageBanner reason={fallbackReason} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
