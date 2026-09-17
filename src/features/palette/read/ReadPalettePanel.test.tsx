import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadPalettePanel } from './ReadPalettePanel'
import type { ReadPalettePanelProps } from './ReadPalettePanel'
import type { ReadResult } from './readPalette'

vi.mock('./readPalette', () => ({ readPalette: vi.fn() }))

vi.mock('./ocrWorker', () => ({
  recognizeWords: vi.fn(),
  releaseWorkerSoon: vi.fn(),
}))

const OCR_RESULT: ReadResult = {
  colors: ['#101828', '#2f6bff', '#475467'],
  roleMap: {
    background: '#ffffff',
    surface: '#475467',
    text: '#101828',
    muted: '#475467',
    primary: '#2f6bff',
    accent: '#2f6bff',
  },
  degraded: false,
  source: 'ocr',
  candidates: [
    { hex: '#101828', source: 'ocr', confidence: 96 },
    { hex: '#2f6bff', source: 'ocr', confidence: 91 },
    { hex: '#475467', source: 'ocr', confidence: 88 },
    { hex: '#d0d5dd', source: 'ocr', confidence: 54, repaired: true },
    { hex: '#f2f4f7', source: 'blobs', area: 1200 },
  ],
}

function renderPanel(overrides: Partial<ReadPalettePanelProps> = {}) {
  const handlers = {
    onRead: vi.fn(),
    onCancelRead: vi.fn(),
    onOpenCrop: vi.fn(),
    onApply: vi.fn(),
    onKeepAutoCrop: vi.fn(),
    onDismiss: vi.fn(),
  }

  render(
    <ReadPalettePanel
      result={null}
      phase={null}
      error={null}
      hasCrop={false}
      {...handlers}
      {...overrides}
    />,
  )

  return handlers
}

afterEach(cleanup)

describe('ReadPalettePanel idle state', () => {
  it('offers a read and a crop, and names an existing crop as an edit', () => {
    const { onRead, onOpenCrop } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Read palette' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }))

    expect(onRead).toHaveBeenCalledTimes(1)
    expect(onOpenCrop).toHaveBeenCalledTimes(1)

    cleanup()
    renderPanel({ hasCrop: true })

    expect(screen.getByRole('button', { name: 'Edit crop' })).toBeInTheDocument()
  })

  it('shows a read failure as an alert', () => {
    renderPanel({ error: "Couldn't read colors from that image" })

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't read colors from that image",
    )
  })
})

describe('ReadPalettePanel reading state', () => {
  it('announces the phase and cancels on request', () => {
    const { onCancelRead } = renderPanel({
      phase: { phase: 'recognizing', fraction: 0.4 },
    })

    const progress = screen.getByText('Reading… 40 %')
    expect(progress).toHaveAttribute('aria-live', 'polite')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancelRead).toHaveBeenCalledTimes(1)
  })

  it('names the engine load and the blob pass', () => {
    renderPanel({ phase: { phase: 'loading-engine' } })
    expect(screen.getByText('Loading reader…')).toBeInTheDocument()

    cleanup()
    renderPanel({ phase: { phase: 'detecting' } })
    expect(screen.getByText('Detecting swatches…')).toBeInTheDocument()
  })

  it('hides the review while a new read is running', () => {
    renderPanel({ result: OCR_RESULT, phase: { phase: 'detecting' } })

    expect(
      screen.queryByRole('button', { name: 'Apply (replace)' }),
    ).not.toBeInTheDocument()
  })
})

describe('ReadPalettePanel review state', () => {
  it('summarises an OCR read and checks its unrepaired candidates', () => {
    renderPanel({ result: OCR_RESULT })

    expect(screen.getByText('Read 4 hex codes from the card')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /#101828/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /#475467/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /#d0d5dd/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /#f2f4f7/ })).not.toBeChecked()
    expect(screen.getByText('repaired')).toBeInTheDocument()
    expect(screen.getAllByText('OCR')).toHaveLength(4)
    expect(screen.getByText('BLOB')).toBeInTheDocument()
    expect(screen.getByText('96%')).toBeInTheDocument()
  })

  it('applies the checked hexes in replace mode', () => {
    const { onApply } = renderPanel({ result: OCR_RESULT })

    fireEvent.click(screen.getByRole('checkbox', { name: /#2f6bff/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply (replace)' }))

    expect(onApply).toHaveBeenCalledWith(['#101828', '#475467'], 'replace')
  })

  it('appends the checked hexes without replacing', () => {
    const { onApply } = renderPanel({ result: OCR_RESULT })

    fireEvent.click(screen.getByRole('checkbox', { name: /#d0d5dd/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Append' }))

    expect(onApply).toHaveBeenCalledWith(
      ['#101828', '#2f6bff', '#475467', '#d0d5dd'],
      'append',
    )
    expect(screen.getByText('adds swatches, keeps roles')).toBeInTheDocument()
  })

  it('disables both actions once nothing is checked', () => {
    renderPanel({ result: OCR_RESULT })

    for (const hex of ['#101828', '#2f6bff', '#475467']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(hex) }))
    }

    expect(screen.getByRole('button', { name: 'Apply (replace)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Append' })).toBeDisabled()
  })

  it('offers to keep the crop the read detected', () => {
    const autoCrop = { x: 0.1, y: 0.2, w: 0.6, h: 0.5 }
    const { onKeepAutoCrop } = renderPanel({
      result: { ...OCR_RESULT, autoCrop },
    })

    expect(screen.getByText('Read from the detected card')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Keep this crop' }))
    expect(onKeepAutoCrop).toHaveBeenCalledWith(autoCrop)
  })

  it('says so when OCR could not load and when no text was found', () => {
    const blobResult: ReadResult = {
      ...OCR_RESULT,
      source: 'blobs',
      candidates: [{ hex: '#f2f4f7', source: 'blobs', area: 1200 }],
    }

    renderPanel({ result: { ...blobResult, ocrUnavailable: true } })
    expect(
      screen.getByText('OCR unavailable — using swatch shapes'),
    ).toBeInTheDocument()

    cleanup()
    renderPanel({ result: blobResult })
    expect(
      screen.getByText('No hex text found — using swatch shapes'),
    ).toBeInTheDocument()

    cleanup()
    renderPanel({
      result: {
        ...blobResult,
        source: 'quantize',
        candidates: [{ hex: '#f2f4f7', source: 'quantize' }],
      },
    })
    expect(screen.getByText('Using quantized colors')).toBeInTheDocument()
  })

  it('names the source that won before it blames the missing engine', () => {
    renderPanel({
      result: {
        ...OCR_RESULT,
        source: 'quantize',
        ocrUnavailable: true,
        candidates: [{ hex: '#f2f4f7', source: 'quantize' }],
      },
    })
    expect(
      screen.getByText('OCR unavailable — using quantized colors'),
    ).toBeInTheDocument()

    cleanup()
    renderPanel({ result: { ...OCR_RESULT, ocrUnavailable: true } })
    expect(
      screen.getByText('Read 4 hex codes from the card'),
    ).toBeInTheDocument()
  })

  it('dismisses the review without applying anything', () => {
    const { onDismiss, onApply } = renderPanel({ result: OCR_RESULT })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('re-checks the defaults when a new result arrives', () => {
    const onApply = vi.fn()
    const panel = (result: ReadResult) => (
      <ReadPalettePanel
        result={result}
        phase={null}
        error={null}
        hasCrop={false}
        onRead={vi.fn()}
        onCancelRead={vi.fn()}
        onOpenCrop={vi.fn()}
        onApply={onApply}
        onKeepAutoCrop={vi.fn()}
        onDismiss={vi.fn()}
      />
    )

    const { rerender } = render(panel(OCR_RESULT))
    fireEvent.click(screen.getByRole('checkbox', { name: /#101828/ }))

    rerender(panel({ ...OCR_RESULT }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply (replace)' }))

    expect(onApply).toHaveBeenCalledWith(
      ['#101828', '#2f6bff', '#475467'],
      'replace',
    )
  })
})

describe('ReadPalettePanel focus', () => {
  function panel(result: ReadResult | null) {
    return (
      <ReadPalettePanel
        result={result}
        phase={null}
        error={null}
        hasCrop={false}
        onRead={vi.fn()}
        onCancelRead={vi.fn()}
        onOpenCrop={vi.fn()}
        onApply={vi.fn()}
        onKeepAutoCrop={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
  }

  it('lands on the read button once the review closes', () => {
    const { rerender } = render(panel(OCR_RESULT))

    fireEvent.click(screen.getByRole('button', { name: 'Apply (replace)' }))
    rerender(panel(null))

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Read palette' }),
    )
  })

  it('takes no focus when it mounts with nothing to review', () => {
    render(panel(null))

    expect(document.activeElement).toBe(document.body)
  })
})
