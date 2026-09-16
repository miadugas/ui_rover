import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, RefObject } from 'react'
import type { RejectionReason } from './imageLimits'
import { validateIncomingFiles } from './imageLimits'
import { makeThumb, readImageMeta } from './imageMeta'

export interface PendingImage {
  tempId: string
  blob: Blob
  objectUrl: string
  width: number
  height: number
  mime: string
  thumb: Blob
}

export interface Rejection {
  id: string
  /** Empty for a clipboard paste that carried no file at all. */
  fileName: string
  reason: RejectionReason
}

export interface DropZoneProps {
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

export interface PickerInputProps {
  ref: RefObject<HTMLInputElement | null>
  type: 'file'
  multiple: true
  accept: string
  hidden: true
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

export interface ImageIntake {
  images: PendingImage[]
  add: (files: File[]) => Promise<void>
  remove: (tempId: string) => void
  move: (tempId: string, direction: 'up' | 'down') => void
  clear: () => void
  rejections: Rejection[]
  dismissRejections: () => void
  dropZoneProps: DropZoneProps
  openPicker: () => void
  pickerInputProps: PickerInputProps
}

export interface ImageIntakeOptions {
  /** Paste is document-wide, so a screen with two trays keeps one enabled. */
  enabled?: boolean
}

export function useImageIntake({ enabled = true }: ImageIntakeOptions = {}): ImageIntake {
  const [images, setImages] = useState<PendingImage[]>([])
  const [rejections, setRejections] = useState<Rejection[]>([])
  const imagesRef = useRef<PendingImage[]>([])
  const mountedRef = useRef(true)
  const pickerRef = useRef<HTMLInputElement>(null)

  const commit = useCallback((next: PendingImage[]) => {
    imagesRef.current = next
    setImages(next)
  }, [])

  const add = useCallback(
    async (files: File[]) => {
      const { accepted, rejected } = validateIncomingFiles(imagesRef.current.length, files)

      if (rejected.length > 0) {
        setRejections((previous) => [
          ...previous,
          ...rejected.map((entry) => ({
            id: crypto.randomUUID(),
            fileName: entry.file.name,
            reason: entry.reason,
          })),
        ])
      }
      if (accepted.length === 0) return

      const prepared = await Promise.all(
        accepted.map(async (file) => {
          const [meta, thumb] = await Promise.all([readImageMeta(file), makeThumb(file)])
          return {
            tempId: crypto.randomUUID(),
            blob: file,
            objectUrl: URL.createObjectURL(file),
            width: meta.width,
            height: meta.height,
            mime: file.type,
            thumb,
          }
        }),
      )

      if (!mountedRef.current) {
        for (const image of prepared) URL.revokeObjectURL(image.objectUrl)
        return
      }

      commit([...imagesRef.current, ...prepared])
    },
    [commit],
  )

  const remove = useCallback(
    (tempId: string) => {
      const target = imagesRef.current.find((image) => image.tempId === tempId)
      if (!target) return
      URL.revokeObjectURL(target.objectUrl)
      commit(imagesRef.current.filter((image) => image.tempId !== tempId))
    },
    [commit],
  )

  const move = useCallback(
    (tempId: string, direction: 'up' | 'down') => {
      const idx = imagesRef.current.findIndex((image) => image.tempId === tempId)
      if (idx < 0) return
      const neighborIdx = direction === 'up' ? idx - 1 : idx + 1
      if (neighborIdx < 0 || neighborIdx >= imagesRef.current.length) return

      const next = [...imagesRef.current]
      const moved = next[idx]
      next[idx] = next[neighborIdx]
      next[neighborIdx] = moved
      commit(next)
    },
    [commit],
  )

  const clear = useCallback(() => {
    for (const image of imagesRef.current) URL.revokeObjectURL(image.objectUrl)
    commit([])
  }, [commit])

  const dismissRejections = useCallback(() => setRejections([]), [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const image of imagesRef.current) URL.revokeObjectURL(image.objectUrl)
      imagesRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const onPaste = (event: ClipboardEvent) => {
      if (isTextEntryTarget(event.target)) return

      const transfer = event.clipboardData
      if (!transfer) return

      const files = collectImageFiles(transfer)
      if (files.length === 0) {
        setRejections((previous) => [
          ...previous,
          { id: crypto.randomUUID(), fileName: '', reason: 'not-image' },
        ])
        return
      }

      event.preventDefault()
      void add(files)
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [add, enabled])

  const dropZoneProps = useMemo<DropZoneProps>(
    () => ({
      onDragOver: (event) => event.preventDefault(),
      onDrop: (event) => {
        event.preventDefault()
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (files.length === 0) return
        void add(files)
      },
    }),
    [add],
  )

  const pickerInputProps = useMemo<PickerInputProps>(
    () => ({
      ref: pickerRef,
      type: 'file',
      multiple: true,
      accept: 'image/*',
      hidden: true,
      onChange: (event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ''
        if (files.length === 0) return
        void add(files)
      },
    }),
    [add],
  )

  const openPicker = useCallback(() => pickerRef.current?.click(), [])

  return {
    images,
    add,
    remove,
    move,
    clear,
    rejections,
    dismissRejections,
    dropZoneProps,
    openPicker,
    pickerInputProps,
  }
}

/**
 * Paste is listened for on `document`, so it also sees text pasted into the URL
 * field. Typing a post URL is not a failed image paste: bail out before any
 * rejection or `preventDefault` when the event started in a text entry.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') return true
  if (target.isContentEditable) return true

  return target.closest('[contenteditable=""],[contenteditable="true"]') !== null
}

function collectImageFiles(transfer: DataTransfer): File[] {
  const fromFiles = Array.from(transfer.files ?? []).filter((file) =>
    file.type.startsWith('image/'),
  )
  if (fromFiles.length > 0) return fromFiles

  const fromItems: File[] = []
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) fromItems.push(file)
  }
  return fromItems
}
