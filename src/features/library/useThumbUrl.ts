import { useEffect, useState } from 'react'
import { getThumbBlob } from '../../lib/db'

interface LoadedThumb {
  imageId: string
  url: string
}

/**
 * Reads a stored thumb Blob and hands back an object URL, but only while
 * `active` is true — the library grid flips that on viewport intersection so a
 * large library never materializes every blob at once (plan §11, ARCHI §17).
 *
 * Creation and revocation both live in this one effect, so React 19's
 * StrictMode remount (effect → cleanup → effect) can never leak a URL: the
 * pre-resolution cleanup cancels the read before an URL exists, and any URL
 * that did get created is revoked by the cleanup that follows it.
 */
export function useThumbUrl(
  imageId: string | undefined,
  active: boolean,
): string | null {
  const [thumb, setThumb] = useState<LoadedThumb | null>(null)

  useEffect(() => {
    if (!imageId || !active) return

    let cancelled = false
    let objectUrl: string | null = null

    void getThumbBlob(imageId)
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setThumb({ imageId, url: objectUrl })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      setThumb(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId, active])

  if (!imageId || !active) return null
  return thumb?.imageId === imageId ? thumb.url : null
}
