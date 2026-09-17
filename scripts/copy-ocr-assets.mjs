#!/usr/bin/env node
// Copies Tesseract.js runtime assets from node_modules into public/ocr/ so
// the OCR reader can load them same-origin, with no CDN fetch. Idempotent:
// skips a file whose destination size already matches the source. Run via
// `predev`/`prebuild` (package.json) — never commit public/ocr/ (gitignored).
import { mkdirSync, statSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const destDir = join(rootDir, 'public', 'ocr')

// [sourcePath relative to node_modules, destination filename in public/ocr/]
const FILES = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  [
    'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js',
  ],
  [
    'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
    'tesseract-core-relaxedsimd-lstm.wasm.js',
  ],
  [
    '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
    'eng.traineddata.gz',
  ],
]

mkdirSync(destDir, { recursive: true })

for (const [relSource, destName] of FILES) {
  const sourcePath = join(rootDir, 'node_modules', relSource)
  const destPath = join(destDir, destName)

  let sourceStat
  try {
    sourceStat = statSync(sourcePath)
  } catch {
    console.error(`copy-ocr-assets: missing source ${sourcePath}`)
    process.exit(1)
  }

  let destStat
  try {
    destStat = statSync(destPath)
  } catch {
    destStat = null
  }

  if (destStat && destStat.size === sourceStat.size) {
    console.log(`copy-ocr-assets: skip ${destName} (up to date)`)
    continue
  }

  copyFileSync(sourcePath, destPath)
  console.log(`copy-ocr-assets: copied ${destName} (${sourceStat.size} bytes)`)
}
