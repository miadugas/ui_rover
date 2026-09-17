import { describe, expect, it } from 'vitest'
import { OEM, PSM } from 'tesseract.js'
import {
  OCR_CACHE_METHOD,
  OCR_CROP_WIDTH,
  OCR_LANG,
  OCR_OEM,
  OCR_PARAMETERS,
  OCR_PASSES,
  OCR_PASS_TARGET_CODES,
  ocrAssetUrls,
} from './ocrConfig'

const ORIGIN = 'https://ui-rover.test/library/01H?tab=palette'

describe('ocrAssetUrls', () => {
  it('builds absolute same-origin URLs at the root base', () => {
    expect(ocrAssetUrls('/', ORIGIN)).toEqual({
      workerPath: 'https://ui-rover.test/ocr/worker.min.js',
      corePath: 'https://ui-rover.test/ocr/',
      langPath: 'https://ui-rover.test/ocr/',
    })
  })

  it('builds absolute same-origin URLs under a sub-path base', () => {
    expect(ocrAssetUrls('/ui_rover/', ORIGIN)).toEqual({
      workerPath: 'https://ui-rover.test/ui_rover/ocr/worker.min.js',
      corePath: 'https://ui-rover.test/ui_rover/ocr/',
      langPath: 'https://ui-rover.test/ui_rover/ocr/',
    })
  })

  it('tolerates a base without a trailing slash', () => {
    expect(ocrAssetUrls('/ui_rover', ORIGIN).corePath).toBe(
      'https://ui-rover.test/ui_rover/ocr/',
    )
  })

  it('stays on the document origin', () => {
    const urls = ocrAssetUrls('/ui_rover/', ORIGIN)

    for (const url of Object.values(urls)) {
      expect(new URL(url).origin).toBe(new URL(ORIGIN).origin)
    }
  })
})

describe('OCR configuration', () => {
  it('keeps Tesseract from opening its own cache database', () => {
    expect(OCR_CACHE_METHOD).toBe('none')
  })

  it('uses the spike-selected engine, language and parameters', () => {
    expect(OCR_LANG).toBe('eng')
    expect(OCR_OEM).toBe(OEM.LSTM_ONLY)
    expect(OCR_PARAMETERS).toEqual({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: '',
    })
  })

  it('keeps the tuned upscale width', () => {
    expect(OCR_CROP_WIDTH).toBe(1200)
  })

  it('reads the whole card, then its right-hand column', () => {
    expect(OCR_PASSES).toEqual([
      { name: 'card', xFrac: 0, wFrac: 1, targetWidth: 1200 },
      { name: 'right-column', xFrac: 0.55, wFrac: 0.45, targetWidth: 1000 },
    ])
  })

  it('stops a read once five exact codes are in hand', () => {
    expect(OCR_PASS_TARGET_CODES).toBe(5)
  })

  it('keeps every pass inside the OCR rect', () => {
    for (const pass of OCR_PASSES) {
      expect(pass.xFrac).toBeGreaterThanOrEqual(0)
      expect(pass.wFrac).toBeGreaterThan(0)
      expect(pass.xFrac + pass.wFrac).toBeLessThanOrEqual(1)
    }
  })
})
