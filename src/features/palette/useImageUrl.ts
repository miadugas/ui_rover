import { useEffect, useState } from 'react'
import { getImageBlob } from '../../lib/db'

interface LoadedImage {
  imageId: string
  url: string
}

/**
 * Full-resolution object URL for a stored image.
 *
 * Creation and revocation both live in the same effect so React 19's StrictMode
 * remount (effect → cleanup → effect) cannot leak a URL: the cleanup that runs
 * before the read resolves cancels it, and any URL that did get created is
 * revoked by the cleanup that follows it.
 */
export function useImageUrl(imageId: string | undefined): string | null {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)

  useEffect(() => {
    if (!imageId) return

    let cancelled = false
    let objectUrl: string | null = null

    void getImageBlob(imageId)
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ imageId, url: objectUrl })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      setLoaded(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId])

  if (!imageId) return null
  return loaded?.imageId === imageId ? loaded.url : null
}

export type ImageBlobStatus = 'loading' | 'ready' | 'missing'

export interface ImageBlobState {
  blob: Blob | null
  status: ImageBlobStatus
}

interface LoadedBlob extends ImageBlobState {
  imageId: string
  status: 'ready' | 'missing'
}

export function useImageBlobState(imageId: string | undefined): ImageBlobState {
  const [loaded, setLoaded] = useState<LoadedBlob | null>(null)

  useEffect(() => {
    if (!imageId) return

    let cancelled = false

    void getImageBlob(imageId)
      .then((blob) => {
        if (cancelled) return
        setLoaded(
          blob
            ? { imageId, blob, status: 'ready' }
            : { imageId, blob: null, status: 'missing' },
        )
      })
      .catch(() => {
        if (!cancelled) setLoaded({ imageId, blob: null, status: 'missing' })
      })

    return () => {
      cancelled = true
    }
  }, [imageId])

  if (!imageId) return { blob: null, status: 'missing' }
  if (loaded?.imageId !== imageId) return { blob: null, status: 'loading' }
  return { blob: loaded.blob, status: loaded.status }
}

/** The stored Blob itself — needed by `extract` and `samplePixel`. */
export function useImageBlob(imageId: string | undefined): Blob | null {
  return useImageBlobState(imageId).blob
}
