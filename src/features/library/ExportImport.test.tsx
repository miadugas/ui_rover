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
  }
})

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
})
