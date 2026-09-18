import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { Button } from '../../components/Button'
import {
  buildExport,
  downloadExport,
  estimateExportBytes,
  EXPORT_WARN_BYTES,
  exportFilename,
  importMerge,
  importReplace,
  prepareImport,
  validateExportFile,
} from '../../lib/export'

type ImportBatch = Awaited<ReturnType<typeof prepareImport>>
type ImportMode = 'merge' | 'replace'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

export function ExportImport() {
  const [busy, setBusy] = useState(false)
  const [exportWarningBytes, setExportWarningBytes] = useState<number | null>(
    null,
  )
  const [importBatch, setImportBatch] = useState<ImportBatch | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function createDownload(): Promise<void> {
    const { file } = await buildExport()
    downloadExport(file, exportFilename())
  }

  async function handleExport(): Promise<void> {
    setBusy(true)
    setResult(null)

    try {
      const totalImageBytes = await estimateExportBytes()
      if (totalImageBytes > EXPORT_WARN_BYTES) {
        setExportWarningBytes(totalImageBytes)
        return
      }

      await createDownload()
    } catch (error) {
      setResult(`Nothing changed: ${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function continueExport(): Promise<void> {
    setExportWarningBytes(null)
    setBusy(true)

    try {
      await createDownload()
    } catch (error) {
      setResult(`Nothing changed: ${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selectedFile = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!selectedFile) return

    setBusy(true)
    setResult(null)
    setImportBatch(null)
    setConfirmReplace(false)

    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(await selectedFile.text())
      } catch {
        setResult('Nothing changed: invalid JSON file')
        return
      }

      const validation = validateExportFile(parsed)
      if (!validation.ok) {
        setResult(`Nothing changed: ${validation.problem}`)
        return
      }

      setImportBatch(await prepareImport(validation.file))
      setImportMode('merge')
    } catch (error) {
      setResult(`Nothing changed: ${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function executeImport(mode: ImportMode): Promise<void> {
    if (!importBatch) return

    setBusy(true)
    setResult(null)

    try {
      const outcome =
        mode === 'merge'
          ? await importMerge(importBatch)
          : await importReplace(importBatch)
      const orphanedResult =
        outcome.orphaned > 0
          ? `, ${outcome.orphaned} orphaned components`
          : ''

      setResult(
        `${outcome.imported} imported, ${outcome.skipped} skipped${orphanedResult}`,
      )
      setImportBatch(null)
      setConfirmReplace(false)
    } catch (error) {
      setResult(`Nothing changed: ${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  function chooseMode(mode: ImportMode): void {
    setImportMode(mode)
    setConfirmReplace(false)
  }

  function startImport(): void {
    if (importMode === 'replace') {
      setConfirmReplace(true)
      return
    }

    void executeImport('merge')
  }

  return (
    <section
      aria-labelledby="export-import-heading"
      className="flex flex-col gap-5 rounded-block border border-chrome-200 p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="export-import-heading" className="label-mono text-chrome-700">
          Backup
        </h2>
        <p className="max-w-[65ch] text-sm text-chrome-600">
          Export a portable JSON backup or restore one into this browser.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={() => void handleExport()}>
          {busy ? 'Working…' : 'Export'}
        </Button>
        <label className="inline-flex cursor-pointer items-center rounded-block border border-chrome-300 bg-chrome-0 px-3.5 py-2 text-sm font-medium text-chrome-800 hover:bg-chrome-50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          Import file
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={busy}
            onChange={(event) => void handleFile(event)}
          />
        </label>
      </div>

      {exportWarningBytes !== null && (
        <div className="flex flex-col gap-3 rounded-block border border-chrome-300 bg-chrome-50 p-3">
          <p className="text-sm text-chrome-700">
            This export contains {megabytes(exportWarningBytes)} MB of images.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void continueExport()}>
              Continue
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setExportWarningBytes(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {importBatch && (
        <div className="flex flex-col gap-3 border-t border-chrome-200 pt-4">
          <fieldset disabled={busy} className="flex flex-col gap-2">
            <legend className="label-mono mb-2 text-chrome-600">
              Import mode
            </legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-chrome-800">
              <input
                type="radio"
                name="import-mode"
                value="merge"
                checked={importMode === 'merge'}
                onChange={() => chooseMode('merge')}
              />
              <span>
                <span className="font-medium">Merge</span>
                <span className="block text-chrome-500">
                  Keep existing entries and skip collisions.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-chrome-800">
              <input
                type="radio"
                name="import-mode"
                value="replace"
                checked={importMode === 'replace'}
                onChange={() => chooseMode('replace')}
              />
              <span>
                <span className="font-medium">Replace all</span>
                <span className="block text-chrome-500">
                  Remove this library and restore the selected backup.
                </span>
              </span>
            </label>
          </fieldset>

          {!confirmReplace && (
            <Button disabled={busy} onClick={startImport} className="self-start">
              {importMode === 'merge' ? 'Merge' : 'Replace all'}
            </Button>
          )}

          {confirmReplace && (
            <div className="flex flex-col gap-2 rounded-block border border-chrome-300 p-3">
              <p className="text-sm font-medium text-chrome-800">
                Replace every saved entry?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={() => void executeImport('replace')}
                >
                  Yes, replace everything
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmReplace(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {result && (
        <p aria-live="polite" className="text-sm text-chrome-700">
          {result}
        </p>
      )}
    </section>
  )
}
