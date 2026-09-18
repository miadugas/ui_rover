import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExportImport } from './ExportImport'
import * as exportLib from '../../lib/export'

vi.mock('../../lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/export')>()
  return {
    ...actual,
    buildExport: vi.fn(),
    downloadExport: vi.fn(),
    estimateExportBytes: vi.fn(),
    importMerge: vi.fn(),
    importReplace: vi.fn(),
    prepareImport: vi.fn(),
    validateExportFile: vi.fn(),
  }
})

async function loadImportFile(): Promise<void> {
  vi.mocked(exportLib.validateExportFile).mockReturnValue({
    ok: true,
    file: { format: 'ui_rover', version: 1, exportedAt: 'now', entries: [] },
  })
  vi.mocked(exportLib.prepareImport).mockResolvedValue([])

  const file = new File(['{}'], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve('{}'),
  })
  fireEvent.change(screen.getByLabelText('Import file'), {
    target: { files: [file] },
  })

  await screen.findByRole('button', { name: 'Merge' })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ExportImport', () => {
  it('renders the Export button and the import file input', () => {
    render(<ExportImport />)

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
    expect(screen.getByLabelText('Import file')).toBeInTheDocument()
  })

  it('exports directly when the estimated size is below the warning threshold', async () => {
    vi.mocked(exportLib.estimateExportBytes).mockResolvedValue(
      exportLib.EXPORT_WARN_BYTES - 1,
    )
    vi.mocked(exportLib.buildExport).mockResolvedValue({
      file: { format: 'ui_rover', version: 1, exportedAt: 'now', entries: [] },
      totalImageBytes: 0,
    })

    render(<ExportImport />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() => {
      expect(exportLib.buildExport).toHaveBeenCalled()
      expect(exportLib.downloadExport).toHaveBeenCalled()
    })
  })

  it('warns above the threshold and only exports after Continue', async () => {
    vi.mocked(exportLib.estimateExportBytes).mockResolvedValue(
      exportLib.EXPORT_WARN_BYTES + 1,
    )
    vi.mocked(exportLib.buildExport).mockResolvedValue({
      file: { format: 'ui_rover', version: 1, exportedAt: 'now', entries: [] },
      totalImageBytes: 0,
    })

    render(<ExportImport />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(
      await screen.findByRole('button', { name: 'Continue' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(exportLib.buildExport).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(exportLib.buildExport).toHaveBeenCalled()
      expect(exportLib.downloadExport).toHaveBeenCalled()
    })
  })

  it('shows the orphan count for merge', async () => {
    vi.mocked(exportLib.importMerge).mockResolvedValue({
      imported: 1,
      skipped: 2,
      orphaned: 3,
    })
    render(<ExportImport />)
    await loadImportFile()

    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))

    expect(
      await screen.findByText(
        '1 imported, 2 skipped, 3 orphaned components',
      ),
    ).toBeInTheDocument()
  })

  it('omits the orphan count when no components were orphaned', async () => {
    vi.mocked(exportLib.importMerge).mockResolvedValue({
      imported: 2,
      skipped: 0,
      orphaned: 0,
    })
    render(<ExportImport />)
    await loadImportFile()

    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))

    expect(
      await screen.findByText('2 imported, 0 skipped'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/orphaned components/)).not.toBeInTheDocument()
  })

  it('shows the orphan count for replace', async () => {
    vi.mocked(exportLib.importReplace).mockResolvedValue({
      imported: 4,
      skipped: 0,
      orphaned: 1,
    })
    render(<ExportImport />)
    await loadImportFile()

    fireEvent.click(screen.getByRole('radio', { name: /Replace all/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace all' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Yes, replace everything' }),
    )

    expect(
      await screen.findByText(
        '4 imported, 0 skipped, 1 orphaned components',
      ),
    ).toBeInTheDocument()
  })
})
