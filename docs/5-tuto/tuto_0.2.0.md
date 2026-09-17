# ui_rover v0.2.0 — a detector cascade tuned by a recorded experiment

TL;DR: every OCR setting in `ocrConfig.ts` traces to a row in `docs/6-memo/ocr-spike.md`. Nothing is tuned by feel — measure first, configure the cascade from the numbers, and re-measure before changing either.

## The trap

Four defaults that look right and score 0/5 or worse:

- **`PSM.SPARSE_TEXT`** — the obvious mode for "scattered text on a card." Shatters the palette rows apart and loses the hex column's line context: 0/5 on every crop tried.
- **Character whitelist** (`#0-9A-Fa-f`) — looks like free precision for a hex-only read. Not inert under LSTM (differs in 10/18 matched runs) and mostly turns label text into hex-shaped garbage (`BEST FOR` → `FAEE01`). Buys nothing at the winning config, costs precision everywhere else.
- **Full-image OCR** — simplest possible pipeline, skip cropping entirely. 0/5 exact, 6+ false positives — the quantizer's own chrome grays (`EBECEF`, `757A8A`) get read back as text.
- **Padding the auto-crop** — 2% padding "for safety margin" looked harmless in Node. In the browser it drops every width tried to 0/5; the extra fill pulls Tesseract's layout analysis off the card.

## The experiment

`scripts/spike/ocr-spike.mjs`: one fixture (`docs/6-memo/fixtures/dopely-calm-saas.png`), ground truth corrected by hand (`#2F6BFF`, not the plan's `#2F68FF`), a full config matrix — engine (LSTM/legacy) × PSM (SPARSE_TEXT/AUTO/SINGLE_BLOCK) × whitelist (on/off) × image prep (full-image vs. card crop, upscale width, kernel). Scoring: exact hits against ground truth, false positives (any other `#[0-9a-f]{6}`-shaped token), and `recognize()` time. A later browser follow-up re-ran the winning shapes in Chrome + tesseract.js v7, because Node + `sharp` numbers don't hold for canvas-cropped, wasm-decoded input.

| config | hits | fp | ms |
|---|---|---|---|
| `SPARSE_TEXT`, any crop | 0/5 | 0–1 | 100–470 |
| `SPARSE_TEXT` + whitelist on | 0/5 | 1–4 | 100–460 |
| full image → 2000px | 0/5 | 6 | 1179 |
| padded auto-crop → 1200/1500/1900px | 0/5 | 0 | — |
| right-45%-column → 1000px (unpadded) | 4/5 | 0 | ~220 |
| union: card@1200 + right-column@1000 | 4/5 exact (+1 repaired) | 0 | ~460 |

## The cascade

`readPalette.ts`, trimmed:

```ts
// 1. Cheap detector first: blob detection runs on a ≤240px downsample —
//    orders of magnitude cheaper than OCR, and it never needs a crop.
const { data, width, height } = await downsample(base, BLOB_MAX_EDGE)
const blobs = detectSwatchBlobs(data, width, height)

// 2. Blobs yield the auto-crop; OCR never sees the full screenshot.
const autoCrop = usableCrop ? undefined : autoCropFrom(data, width, height, blobs)
const ocrRect = usableCrop ?? autoCrop

if (ocrRect) {
  hexCodes = await readHexCodes(blob, ocrRect, { detector: { blobs, width, height, ocrRect }, signal })
}

const candidates = [...ocrCandidates(hexCodes), ...blobCandidates(blobs)]

// 3. Source selection is thresholded, not "best available": OCR wins outright
//    at >= MINIMUM_COLORS exact hits, blobs are the fallback, quantize never fails.
if (hexCodes.length >= MINIMUM_COLORS) {
  return paletteFrom(orderedOcrColors(hexCodes), 'ocr', { candidates, autoCrop })
}
if (blobs.length >= MINIMUM_COLORS) {
  return paletteFrom(blobs.map((c) => c.hex), 'blobs', { candidates, autoCrop })
}
const quantized = await extract(base)
// 4. Rejected reads are kept as `candidates`, not discarded — the review UI
//    still gets to show what OCR/blobs guessed even when quantize won.
return { colors: quantized.colors, source: 'quantize', candidates, autoCrop, /* ... */ }
```

`readHexCodes`'s pass loop — sub-rects of the same rect, unioned, with an early stop:

```ts
for (const [index, pass] of OCR_PASSES.entries()) {
  const input = await passInput(blob, rect, pass, firstPassInput)
  const found = await ocrHexCodes(input, { blobs: blobsForPass(detector, pass), signal })

  union = unionByHex(union, found)
  // 5. Early stop: a clean card pays for one pass; a messy one pays for two.
  if (exactCount(union) >= OCR_PASS_TARGET_CODES) break
}
```

## Coordinate spaces

Blob bboxes are measured on the 240px detector downsample. Each OCR pass hands Tesseract its own cropped, upscaled slice, so a pass's words come back in *that slice's* pixels. `hexTokens.ts`'s near-blob proximity test (`isNearBlob`) compares a word bbox to a blob bbox directly — so every pass has to map its blobs into its own pixel space first, or the comparison is meaningless (`blobSpace.ts`):

```ts
const left = (blob.bbox.x0 / detectorWidth - rect.x) / rect.w
const right = (blob.bbox.x1 / detectorWidth - rect.x) / rect.w
// ...normalize into the pass's sub-rect, then scale to that pass's pixels
if (right <= 0 || left >= 1 || bottom <= 0 || top >= 1) continue // outside the sub-rect entirely
mapped.push({ ...blob, bbox: { x0: left * passWidth, y0: top * passHeight, x1: right * passWidth, y1: bottom * passHeight } })
```

Blobs entirely outside a pass's sub-rect are dropped, not clamped — a chip on the far side of the card must not appear "close" to a word just because both project onto the same edge.

## Config as data

`ocrConfig.ts` — every constant cites the memo that produced it:

```ts
/** Spike 2026-09-16 (docs/6-memo/ocr-spike.md): LSTM+AUTO+crop@1200 = 4/5 exact, 0 fp. */
export const OCR_ENGINE_MODE = OEM.LSTM_ONLY

export const OCR_PARAMETERS = {
  tessedit_pageseg_mode: PSM.AUTO,       // not SPARSE_TEXT — see "The trap"
  tessedit_char_whitelist: '',           // off — never a net win, sometimes a net loss
}

/** Tuned peak, not a plateau: 1100 and 1300 both drop to 3/5. */
export const OCR_CROP_WIDTH = 1200

export const OCR_PASSES: readonly OcrPass[] = [
  { name: 'card', xFrac: 0, wFrac: 1, targetWidth: OCR_CROP_WIDTH },
  { name: 'right-column', xFrac: 0.55, wFrac: 0.45, targetWidth: 1000 },
]
```

Changing any of these numbers without a new measurement means shipping a guess with the same confidence as a fact — the comments exist so the next person (or the next fixture) knows which is which.

## Cancel that actually cancels

`ocrWorker.ts` — cancel has to interrupt the two slowest phases (engine load, `recognize()`), not just stop between them:

```ts
async function untilAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return await work

  let onAbort = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      void work.catch(() => {})      // disowned work's rejection stays quiet
      void terminateWorkerNow()      // bumps workerGeneration
      reject(new ReadCancelledError())
    }
    signal.addEventListener('abort', onAbort)
  })

  return await Promise.race([work, aborted])
}
```

`workerGeneration` is the guard `Promise.race` alone can't give you: a creation that lost the race must not null out — or resurrect — the singleton a later read has already put in its place. Every `terminateWorkerNow()` bumps it; a disowned creation checks it before touching `workerPromise`.

## Performance notes

- Per pass: `card@1200` ~235–313ms warm; `right-column@1000` ~220ms — the second pass is geometry, not brute-force upscaling, so it's cheaper than the old 1900px re-run it replaced.
- Two passes, not five: 1900px over the *same* rect never recovered a code 1200px missed. A different crop of the card did. Width helps until it doesn't; region choice kept helping.
- First read pays ~1s + ~50MB for engine creation; `releaseWorkerSoon` tears it down after 60s idle so a session that reads once doesn't hold the memory forever.
- OCR assets (~7MB: wasm core + `eng.traineddata`) are same-origin and fetched once per engine lifetime, not per read.

## Why this shape

A cascade only earns its ordering if cheap steps are provably good enough to gate expensive ones, and "provably" means a scoreboard, not intuition — SPARSE_TEXT and the whitelist both *looked* like the more careful choice and both lost outright on recorded numbers. Running blobs first isn't a performance hack alone: the blob pass is what makes the auto-crop possible, which is what makes OCR accurate at all (0/5 without a crop, 4–5/5 with one). Each threshold — `MINIMUM_COLORS`, `OCR_PASS_TARGET_CODES`, `OCR_CROP_WIDTH` — is committed to a comment that names the memo it came from, so the next fixture that breaks one of them breaks it on purpose, into a new measurement, not a debugging session.

## See also

- Tesseract's page segmentation mode (PSM) documentation — the same AUTO-vs-SPARSE_TEXT tradeoff this spike measured, from the source.
- Google's "Rules of Machine Learning" (Martin Zinkevich) — keep the first model simple, get the infrastructure and instrumentation right before tuning.
- OpenCV's text-detection + Tesseract tutorials, and Apple Live Text / Google Lens's documented split of region detection before recognition — the same "find the box, then read it" cascade at product scale.
