import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
  label?: string
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export function Popover({ open, onClose, anchorRef, children, label }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return

    const anchorRect = anchor.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const spaceBelow = window.innerHeight - anchorRect.bottom
    const flipAbove = spaceBelow < panelRect.height && anchorRect.top > panelRect.height

    panel.style.top = `${flipAbove ? anchorRect.top - panelRect.height : anchorRect.bottom}px`
    panel.style.left = `${anchorRect.left}px`
    panel.style.visibility = 'visible'
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    const initialFocusable = getFocusable(panel)
    ;(initialFocusable[0] ?? panel).focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusables = getFocusable(panel)
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panel.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [open, onClose, anchorRef])

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }
    if (!wasOpenRef.current) return
    wasOpenRef.current = false
    anchorRef.current?.focus()
  }, [open, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      aria-modal="true"
      tabIndex={-1}
      className="wire fixed z-50 rounded-block bg-chrome-0 p-3"
      style={{ top: -9999, left: -9999, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
