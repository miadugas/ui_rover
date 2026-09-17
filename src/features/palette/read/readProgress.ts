/**
 * Progress and cancellation vocabulary shared by the read pipeline (plan §9).
 *
 * A cancelled read always rejects with `ReadCancelledError` so callers can tell
 * "Mia pressed cancel" apart from "the engine failed"; `OcrUnavailableError`
 * marks the one failure the orchestrator swallows to fall through to the next
 * detector.
 */

export type ReadPhase =
  | 'idle'
  | 'loading-engine'
  | 'recognizing'
  | 'detecting'
  | 'done'

export interface ReadProgress {
  phase: ReadPhase
  fraction?: number
}

export type ReadProgressListener = (progress: ReadProgress) => void

export class ReadCancelledError extends Error {
  constructor(message = 'Read cancelled') {
    super(message)
    this.name = 'ReadCancelledError'
  }
}

export class OcrUnavailableError extends Error {
  constructor(message = 'OCR engine unavailable', options?: ErrorOptions) {
    super(message, options)
    this.name = 'OcrUnavailableError'
  }
}

export interface ReadController {
  signal: AbortSignal
  cancel: () => void
}

export function createReadController(): ReadController {
  const controller = new AbortController()

  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
  }
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadCancelledError()
}
