import type { HexCandidate } from './hexTokens'
import { parseHexTokens } from './hexTokens'
import { recognizeWords, releaseWorkerSoon } from './ocrWorker'
import type { ReadProgressListener } from './readProgress'
import type { BlobCandidate } from './swatchBlobs'

export interface OcrHexCodesOptions {
  blobs?: BlobCandidate[]
  onProgress?: ReadProgressListener
  signal?: AbortSignal
}

/**
 * "No text on the card" is a valid result, so it returns `[]`; only an engine
 * that cannot load (`OcrUnavailableError`) or a cancelled read
 * (`ReadCancelledError`) escapes.
 */
export async function ocrHexCodes(
  blob: Blob,
  { blobs, onProgress, signal }: OcrHexCodesOptions = {},
): Promise<HexCandidate[]> {
  try {
    const words = await recognizeWords(blob, { onProgress, signal })
    if (words.length === 0) return []

    return parseHexTokens(words, blobs)
  } finally {
    releaseWorkerSoon()
  }
}
