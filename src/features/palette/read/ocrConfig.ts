import { OEM, PSM } from 'tesseract.js'

export interface OcrAssetUrls {
  workerPath: string
  corePath: string
  langPath: string
}

export const OCR_LANG = 'eng'
export const OCR_OEM = OEM.LSTM_ONLY
export const OCR_CACHE_METHOD = 'none'

// ---- Spike-selected OCR parameters (docs/6-memo/ocr-spike.md) ----
// LSTM + AUTO + crop@1200 reads 4/5 exact codes with 0 false positives on the
// dopely fixture. AUTO, not SPARSE_TEXT: SPARSE_TEXT scored 0/5 because it
// shatters the palette rows and loses the hex column's line context. The
// whitelist is off — it is not inert under LSTM, it just manufactures
// hex-shaped tokens out of label text ("BEST FOR" -> FAEE01).
export const OCR_PARAMETERS = {
  tessedit_pageseg_mode: PSM.AUTO,
  tessedit_char_whitelist: '',
}
// -------------------------------------------------------------------

/** Tuned peak, not a plateau: 1100 and 1300 both drop to 3/5. */
export const OCR_CROP_WIDTH = 1200

export interface OcrPass {
  /** Diagnostic label only; nothing branches on it. */
  name: string
  /** Sub-rect of the OCR rect, as fractions of that rect's own width. */
  xFrac: number
  wFrac: number
  targetWidth: number
}

/**
 * The passes, in order, whose hex tokens are unioned (browser follow-up
 * 2026-09-16 in docs/6-memo/ocr-spike.md).
 *
 * Measured on the unpadded card bbox of the dopely fixture: the whole card at
 * 1200 px reads 2/5 at best, but its right 45 % — the hex column plus enough of
 * each label to keep the row's line context — reads 4/5 at 1000 px, and does so
 * identically under PSM 3, 4 and 6. Neither crop is a superset of the other's
 * hits, so both run and the results union. The old 1900 px re-run of the same
 * rect never added anything in the browser and is gone.
 */
export const OCR_PASSES: readonly OcrPass[] = [
  { name: 'card', xFrac: 0, wFrac: 1, targetWidth: OCR_CROP_WIDTH },
  { name: 'right-column', xFrac: 0.55, wFrac: 0.45, targetWidth: 1000 },
]

/** Enough exact codes to call the read finished and skip the later passes. */
export const OCR_PASS_TARGET_CODES = 5

/**
 * Tesseract spawns its worker from a `blob:` URL, so every asset path has to be
 * absolute — a relative one would resolve against the blob URL and 404.
 * `corePath` and `langPath` stay directory URLs: `getCore` appends the wasm
 * variant it feature-detects, and the language loader appends `eng.traineddata`.
 */
export function ocrAssetUrls(
  baseUrl: string = import.meta.env.BASE_URL,
  origin: string = location.href,
): OcrAssetUrls {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const directory = new URL(`${base}ocr/`, origin)

  return {
    workerPath: new URL('worker.min.js', directory).href,
    corePath: directory.href,
    langPath: directory.href,
  }
}
