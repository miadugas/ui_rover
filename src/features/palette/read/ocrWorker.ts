/**
 * Lazy Tesseract worker singleton (plan §3, §9).
 *
 * Creating a worker costs ~1 s and ~50 MB, so reading several entries in a row
 * pays that once; `releaseWorkerSoon` hands the memory back after an idle
 * minute. Every failure to bring the engine up surfaces as `OcrUnavailableError`
 * so the orchestrator can fall through to the blob/quantize detectors.
 */
import { createWorker } from 'tesseract.js'
import type { Block, LoggerMessage, Worker as TesseractWorker } from 'tesseract.js'
import type { OcrWord } from './hexTokens'
import {
  OCR_CACHE_METHOD,
  OCR_LANG,
  OCR_OEM,
  OCR_PARAMETERS,
  ocrAssetUrls,
} from './ocrConfig'
import { OcrUnavailableError, ReadCancelledError } from './readProgress'
import type { ReadPhase, ReadProgressListener } from './readProgress'

export interface RecognizeWordsOptions {
  onProgress?: ReadProgressListener
  signal?: AbortSignal
}

export const WORKER_IDLE_MS = 60_000

const LOADING_STATUSES = new Set([
  'loading tesseract core',
  'initializing tesseract',
  'initializing',
  'loading language traineddata',
  'loaded language traineddata',
  'initializing api',
  'initialized api',
])
const RECOGNIZING_STATUS = 'recognizing text'

let workerPromise: Promise<TesseractWorker> | null = null
/**
 * Bumped by every teardown, the way `useDebouncedPatch` bumps its generation:
 * a creation that was disowned mid-flight must not null out — or resurrect —
 * the singleton a later read has already put in its place.
 */
let workerGeneration = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null
let progressListener: ReadProgressListener | null = null

function phaseForStatus(status: string): ReadPhase | null {
  if (status === RECOGNIZING_STATUS) return 'recognizing'
  if (LOADING_STATUSES.has(status)) return 'loading-engine'
  return null
}

function reportStatus({ status, progress }: LoggerMessage): void {
  const phase = phaseForStatus(status)
  if (!phase || !progressListener) return

  progressListener({ phase, fraction: progress })
}

function clearIdleTimer(): void {
  if (idleTimer === null) return

  clearTimeout(idleTimer)
  idleTimer = null
}

export function getWorker(
  onProgress?: ReadProgressListener,
): Promise<TesseractWorker> {
  clearIdleTimer()
  progressListener = onProgress ?? null

  if (workerPromise) return workerPromise

  const generation = workerGeneration
  const { workerPath, corePath, langPath } = ocrAssetUrls()
  const created: Promise<TesseractWorker> = createWorker(OCR_LANG, OCR_OEM, {
    workerPath,
    corePath,
    langPath,
    cacheMethod: OCR_CACHE_METHOD,
    logger: reportStatus,
  }).then(async (worker) => {
    await worker.setParameters(OCR_PARAMETERS)
    return worker
  })

  const guarded: Promise<TesseractWorker> = created.catch((cause: unknown) => {
    if (workerGeneration === generation) workerPromise = null
    throw new OcrUnavailableError('OCR engine could not be started', { cause })
  })

  workerPromise = guarded
  return guarded
}

export function releaseWorkerSoon(delayMs = WORKER_IDLE_MS): void {
  clearIdleTimer()
  if (!workerPromise) return

  idleTimer = setTimeout(() => {
    idleTimer = null
    void terminateWorkerNow()
  }, delayMs)
}

export async function terminateWorkerNow(): Promise<void> {
  clearIdleTimer()
  progressListener = null

  const pending = workerPromise
  workerGeneration += 1
  workerPromise = null
  if (!pending) return

  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    // A worker that never came up needs no teardown.
  }
}

function flattenWords(blocks: Block[] | null): OcrWord[] {
  if (!blocks) return []

  return blocks.flatMap((block) =>
    (block.paragraphs ?? []).flatMap((paragraph) =>
      (paragraph.lines ?? []).flatMap((line) =>
        (line.words ?? []).map((word) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox,
        })),
      ),
    ),
  )
}

async function cancel(): Promise<never> {
  await terminateWorkerNow()
  throw new ReadCancelledError()
}

/**
 * Cancel has to bite while the engine is still loading or still recognizing,
 * which are the two slowest things a read does — polling between them left
 * Cancel doing nothing for the ~1 s the worker takes to come up. The abandoned
 * work keeps a catch so a later rejection from the disowned worker stays quiet,
 * and teardown is not awaited: the rejection is Mia's answer, not the engine's.
 */
async function untilAborted<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return await work
  if (signal.aborted) {
    void work.catch(() => {})
    return await cancel()
  }

  let onAbort = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      void work.catch(() => {})
      void terminateWorkerNow()
      reject(new ReadCancelledError())
    }
    signal.addEventListener('abort', onAbort)
  })

  try {
    return await Promise.race([work, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export async function recognizeWords(
  blob: Blob,
  { onProgress, signal }: RecognizeWordsOptions = {},
): Promise<OcrWord[]> {
  if (signal?.aborted) return cancel()

  const worker = await untilAborted(getWorker(onProgress), signal)

  let blocks: Block[] | null
  try {
    const { data } = await untilAborted(
      worker.recognize(blob, {}, { blocks: true }),
      signal,
    )
    blocks = data.blocks
  } catch (cause) {
    if (cause instanceof ReadCancelledError) throw cause
    if (signal?.aborted) return cancel()

    await terminateWorkerNow()
    throw new OcrUnavailableError('OCR engine failed while recognizing', {
      cause,
    })
  }

  if (signal?.aborted) return cancel()
  return flattenWords(blocks)
}
