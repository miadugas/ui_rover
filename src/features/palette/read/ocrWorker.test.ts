import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import type {
  Block,
  LoggerMessage,
  Worker as TesseractWorker,
} from 'tesseract.js'
import {
  OCR_CACHE_METHOD,
  OCR_LANG,
  OCR_OEM,
  OCR_PARAMETERS,
} from './ocrConfig'
import {
  WORKER_IDLE_MS,
  getWorker,
  recognizeWords,
  releaseWorkerSoon,
  terminateWorkerNow,
} from './ocrWorker'
import { OcrUnavailableError, ReadCancelledError } from './readProgress'
import type { ReadProgress } from './readProgress'

vi.mock('tesseract.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()

  return { ...actual, createWorker: vi.fn() }
})

type FakeWorker = {
  setParameters: ReturnType<typeof vi.fn>
  recognize: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}

function blocksFor(words: Array<[string, number]>): Block[] {
  return [
    {
      paragraphs: [
        {
          lines: [
            {
              words: words.map(([text, confidence], index) => ({
                text,
                confidence,
                bbox: { x0: index * 30, y0: 0, x1: index * 30 + 20, y1: 12 },
              })),
            },
          ],
        },
      ],
    },
  ] as unknown as Block[]
}

function fakeWorker(blocks: Block[] | null = blocksFor([])): FakeWorker {
  return {
    setParameters: vi.fn().mockResolvedValue({ jobId: 'job', data: null }),
    recognize: vi.fn().mockResolvedValue({ jobId: 'job', data: { blocks } }),
    terminate: vi.fn().mockResolvedValue({ jobId: 'job', data: null }),
  }
}

function resolveWith(worker: FakeWorker): void {
  vi.mocked(createWorker).mockResolvedValue(
    worker as unknown as TesseractWorker,
  )
}

function loggerFromCreation(): (message: LoggerMessage) => void {
  const options = vi.mocked(createWorker).mock.calls[0][2]
  const logger = options?.logger
  if (!logger) throw new Error('createWorker was called without a logger')

  return logger
}

const IMAGE = new Blob(['card'])

describe('ocrWorker', () => {
  beforeEach(() => {
    resolveWith(fakeWorker())
  })

  afterEach(async () => {
    await terminateWorkerNow()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('creates the worker once and configures it with the spike parameters', async () => {
    const worker = fakeWorker(blocksFor([['#101828', 92]]))
    resolveWith(worker)

    await recognizeWords(IMAGE)
    await recognizeWords(IMAGE)

    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(createWorker).toHaveBeenCalledWith(
      OCR_LANG,
      OCR_OEM,
      expect.objectContaining({
        cacheMethod: OCR_CACHE_METHOD,
        workerPath: expect.stringContaining('/ocr/worker.min.js'),
        corePath: expect.stringContaining('/ocr/'),
        langPath: expect.stringContaining('/ocr/'),
      }),
    )
    expect(worker.setParameters).toHaveBeenCalledTimes(1)
    expect(worker.setParameters).toHaveBeenCalledWith(OCR_PARAMETERS)
    expect(worker.recognize).toHaveBeenCalledTimes(2)
  })

  it('asks for block output and flattens the word tree', async () => {
    const worker = fakeWorker(
      blocksFor([
        ['#101828', 92],
        ['Brand', 71],
      ]),
    )
    resolveWith(worker)

    const words = await recognizeWords(IMAGE)

    expect(worker.recognize).toHaveBeenCalledWith(IMAGE, {}, { blocks: true })
    expect(words).toEqual([
      { text: '#101828', confidence: 92, bbox: { x0: 0, y0: 0, x1: 20, y1: 12 } },
      { text: 'Brand', confidence: 71, bbox: { x0: 30, y0: 0, x1: 50, y1: 12 } },
    ])
  })

  it('returns no words when the page carries no blocks', async () => {
    resolveWith(fakeWorker(null))

    await expect(recognizeWords(IMAGE)).resolves.toEqual([])
  })

  it('maps Tesseract statuses onto read phases', async () => {
    const progress: ReadProgress[] = []
    await getWorker((update) => progress.push(update))
    const logger = loggerFromCreation()

    logger({ status: 'loading tesseract core', progress: 0.2 } as LoggerMessage)
    logger({ status: 'initializing', progress: 0.5 } as LoggerMessage)
    logger({
      status: 'loading language traineddata',
      progress: 0.7,
    } as LoggerMessage)
    logger({ status: 'recognizing text', progress: 0.4 } as LoggerMessage)
    logger({ status: 'something else', progress: 1 } as LoggerMessage)

    expect(progress).toEqual([
      { phase: 'loading-engine', fraction: 0.2 },
      { phase: 'loading-engine', fraction: 0.5 },
      { phase: 'loading-engine', fraction: 0.7 },
      { phase: 'recognizing', fraction: 0.4 },
    ])
  })

  it('reports a failed creation as OcrUnavailableError and retries next time', async () => {
    const worker = fakeWorker()
    vi.mocked(createWorker)
      .mockRejectedValueOnce(new Error('404 /ocr/worker.min.js'))
      .mockResolvedValue(worker as unknown as TesseractWorker)

    await expect(recognizeWords(IMAGE)).rejects.toBeInstanceOf(
      OcrUnavailableError,
    )

    await expect(recognizeWords(IMAGE)).resolves.toEqual([])
    expect(createWorker).toHaveBeenCalledTimes(2)
  })

  it('terminates the worker after the idle delay', async () => {
    const worker = fakeWorker()
    resolveWith(worker)
    vi.useFakeTimers()

    await getWorker()
    releaseWorkerSoon()
    await vi.advanceTimersByTimeAsync(WORKER_IDLE_MS)

    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('cancels a scheduled teardown when another read starts', async () => {
    const worker = fakeWorker()
    resolveWith(worker)
    vi.useFakeTimers()

    await getWorker()
    releaseWorkerSoon()
    await getWorker()
    await vi.advanceTimersByTimeAsync(WORKER_IDLE_MS)

    expect(worker.terminate).not.toHaveBeenCalled()
  })

  it('terminates and rejects with ReadCancelledError when aborted mid-recognize', async () => {
    const controller = new AbortController()
    const worker = fakeWorker()
    worker.recognize.mockImplementation(() => {
      controller.abort()
      return Promise.resolve({ jobId: 'job', data: { blocks: null } })
    })
    resolveWith(worker)

    await expect(
      recognizeWords(IMAGE, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ReadCancelledError)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('rejects while the engine is still loading, and reaps it on arrival', async () => {
    const controller = new AbortController()
    const worker = fakeWorker()
    let startWorker = () => {}
    vi.mocked(createWorker).mockReturnValue(
      new Promise<TesseractWorker>((resolve) => {
        startWorker = () => resolve(worker as unknown as TesseractWorker)
      }),
    )

    const pending = recognizeWords(IMAGE, { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toBeInstanceOf(ReadCancelledError)
    expect(worker.setParameters).not.toHaveBeenCalled()

    startWorker()
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledTimes(1))
  })

  it('rejects while recognition is still running', async () => {
    const controller = new AbortController()
    const worker = fakeWorker()
    worker.recognize.mockReturnValue(new Promise(() => {}))
    resolveWith(worker)

    const pending = recognizeWords(IMAGE, { signal: controller.signal })
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(pending).rejects.toBeInstanceOf(ReadCancelledError)
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledTimes(1))
  })

  it('creates a fresh worker for the read after a cancelled one', async () => {
    const controller = new AbortController()
    const cancelled = fakeWorker()
    let startWorker = () => {}
    vi.mocked(createWorker).mockReturnValueOnce(
      new Promise<TesseractWorker>((resolve) => {
        startWorker = () => resolve(cancelled as unknown as TesseractWorker)
      }),
    )

    const pending = recognizeWords(IMAGE, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(ReadCancelledError)
    startWorker()

    resolveWith(fakeWorker(blocksFor([['#101828', 92]])))

    await expect(recognizeWords(IMAGE)).resolves.toEqual([
      { text: '#101828', confidence: 92, bbox: { x0: 0, y0: 0, x1: 20, y1: 12 } },
    ])
    expect(createWorker).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(cancelled.terminate).toHaveBeenCalledTimes(1))
  })

  it('never starts the engine when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      recognizeWords(IMAGE, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ReadCancelledError)
    expect(createWorker).not.toHaveBeenCalled()
  })
})
