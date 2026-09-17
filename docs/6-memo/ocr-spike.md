# OCR spike — Phase 0 gate for v0.2.0 "read the palette"

**Date:** 2026-09-16 · **Script:** `scripts/spike/ocr-spike.mjs` · **Fixture:** `docs/6-memo/fixtures/dopely-calm-saas.png` (3024×1964)

**Gate result: PASS.** Best single pass reads **4 / 5** exact codes with **0 false positives** in ~235 ms. A cheap two-pass variant reads **5 / 5** with 0 false positives in ~775 ms. The plan does **not** need re-scoping.

## Ground-truth correction

The plan and the spike brief list `#2F68FF` for row 2. The card actually prints **`#2F6BFF`**, confirmed two ways: the glyphs at 10× zoom, and the mean pixel of the Brand Blue swatch itself (`#2f6bff`). Scoring below uses the corrected set:

```
#101828  #2F6BFF  #475467  #D0D5DD  #FFFFFF
```

`§ Problem Statement` in `F_0.2.0_read-the-palette.plan.md` should be corrected too.

## Results

Engine × PSM × whitelist × image prep. `hits` = ground-truth codes read exactly (case-insensitive, `#` optional). `fp` = other `#?[0-9a-f]{6}` tokens. Timings are warm-worker `recognize()` on an M-series Mac, Node 24.

| engine | psm | whitelist | input | hits | fp | ms |
|---|---|---|---|---|---|---|
| **LSTM** | **AUTO** | **off** | **crop → 1200 px, lanczos3** | **4/5** | **0** | **235** |
| LSTM | AUTO | on | crop → 1200 px, lanczos3 | 4/5 | 0 | 233 |
| LSTM | AUTO | on | crop → 1200 px, nearest | 3/5 | 1 | 200 |
| LSTM | AUTO | on | crop → 1848 px (4×), lanczos3 | 3/5 | 0 | 329 |
| LSTM | AUTO | off | crop → 1200 px, nearest | 2/5 | 1 | 202 |
| LSTM | AUTO | off | crop → 1848 px (4×), lanczos3 | 2/5 | 0 | 330 |
| LSTM | AUTO | off/on | crop → 924 px (2×), lanczos3 | 1/5 | 0 | ~265 |
| LSTM | SINGLE_BLOCK | off/on | any crop | 0–1/5 | 0–1 | 40–330 |
| LSTM | SPARSE_TEXT | off | any crop | 0/5 | 0–1 | 100–470 |
| LSTM | SPARSE_TEXT | on | any crop | 0/5 | 1–4 | 100–460 |
| LSTM | AUTO | off | full image → 2000 px | 0/5 | 6 | 1179 |
| LSTM | SPARSE_TEXT | on | full image → 2000 px | 0/5 | 14 | 1400 |
| LEGACY | AUTO | off | rows-only crop → 1200 px | 1/5 | 0 | 152 |
| LEGACY | AUTO | on | crop → 1848 px (4×), lanczos3 | 1/5 | 3 | 956 |
| LEGACY | * | * | everything else | 0/5 | 0–13 | 55–3423 |

Width sweep at LSTM / AUTO (crop upscaled to N px wide, lanczos3):

| width | 1000 | 1100 | **1200** | 1300 | 1400 | 1500–1800 | 1900 | 2000–2200 |
|---|---|---|---|---|---|---|---|---|
| hits | 0/5 | 3/5 | **4/5** | 3/5 | 3/5 | ≤2/5 | 3/5 | ≤2/5 |

Preprocessing at LSTM / AUTO / 1200 px: colour + `lanczos3` / `cubic` / `mitchell` all give 4/5; `nearest` gives 2–3/5; `grayscale()` drops to 3/5; `grayscale().sharpen()` 2/5; `threshold(150)` 0/5.

## Decisions

**(a) Whitelist: OFF.** It is *not* inert under LSTM — the plan's hypothesis is wrong. Across 18 matched LSTM pairs the output differed in 10. But the effect is not a win: at the chosen config it changes nothing at all, and everywhere else it mostly manufactures hex-shaped garbage out of ordinary label text (`FAEE01` from the "BEST FOR" chips, `BADECA`, `BFACEE`, `0AEFAE`). Under SPARSE_TEXT it turned a 0-fp run into a 4-fp run. Whitelist on buys nothing at the winning config and costs precision everywhere else.

**(b) Engine: LSTM_ONLY.** Legacy was provisioned in full (`@tesseract.js-data/eng/4.0.0` and the legacy core builds are already in `node_modules`) and lost outright — best legacy run was 1/5, it is 2–4× slower, and it produces far more false positives. **Do not bundle the legacy core or the 10.9 MB legacy traineddata.** `copy-ocr-assets.mjs` stays as specified in plan §1.

**(c) PSM: `AUTO`.** `SPARSE_TEXT` is the plan's default hypothesis and it is the worst option on this fixture — 0/5 on every crop, because it shatters the pill-shaped rows and reads the hex column out of line context. `SINGLE_BLOCK` is nearly as bad (0–1/5). `AUTO` lets Tesseract find the row structure, which is what makes the codes readable at all.

**(d) Crop + upscale: REQUIRED, and it is the single biggest factor.** The full image at 2000 px reads 0/5 and returns 6–14 false positives — it recovers the quantizer's chrome grays (`EBECEF`, `757A8A`, `484340`, `15181C`) as *text*, which would be actively harmful. Upscale with smoothing (`imageSmoothingEnabled = true`, `imageSmoothingQuality = 'high'`), not nearest-neighbour — this confirms plan §2. Do **not** grayscale or threshold first.

The 1200 px target is a narrow peak, not a plateau (1100 → 3/5, 1300 → 3/5). Treat `minWidth = 1200` as tuned rather than safe, and keep it in `ocrConfig.ts` where it is easy to revisit when more fixtures land.

### Crop rect that worked

Normalized 0–1 over the intrinsic image, the "Calm SaaS" card body:

```ts
{ x: 0.3631, y: 0.4292, w: 0.1528, h: 0.2974 }
```

(= 462 × 584 px in the 3024 × 1964 fixture, upscaled ~2.6× to 1200 px wide.)

A tighter crop of just the five hex rows (`{ x: 0.3631, y: 0.5245, w: 0.1528, h: 0.1002 }`) scored **worse** (0–1/5) — `AUTO` needs the surrounding rows to establish layout. Mia's crop UI should encourage framing the whole card, not the codes.

## Recommended: two passes

1200 px and 1900 px are complementary. 1200 reads four codes but collapses the `5` in `#D0D5DD` (→ `D0DDD` / `D0DSSDD`); 1900 reads `#D0D5DD` but loses `#2F6BFF` and `#475467`. Unioning hex tokens from both passes on the same warm worker:

```
width 1200: prep 23ms  ocr 313ms  4/5  [101828 2F6BFF 475467 FFFFFF]
width 1900: prep 43ms  ocr 396ms  3/5  [101828 D0D5DD FFFFFF]
UNION:      5/5 exact, 0 false positives, 775ms total
```

Zero false positives, so the union costs nothing in precision — the second pass is ~430 ms and buys the fifth code. Worth doing in `ocrHexCodes` if a single pass returns fewer than the expected number of candidates; the dedupe and reading-order rules in plan §3 already handle merging two word lists.

## Timing

| step | ms |
|---|---|
| worker create (Node, local lang data) | ~95 |
| sharp crop + upscale to 1200 px | ~23 |
| `recognize()` at 1200 px, warm | ~238 (cold 313) |
| second pass at 1900 px | ~440 |

Node numbers only. Browser wasm will be slower and worker creation much slower (~1 s per plan §Why the worker is a lazy singleton), since the browser fetches and gunzips the 2.95 MB traineddata.

## Values for `src/features/palette/read/ocrConfig.ts`

```ts
import { OEM, PSM } from 'tesseract.js';

/** Spike 2026-09-16 (docs/6-memo/ocr-spike.md): LSTM+AUTO+crop@1200 = 4/5 exact, 0 false positives. */
export const OCR_ENGINE_MODE = OEM.LSTM_ONLY;

/**
 * PSM.AUTO, not SPARSE_TEXT. SPARSE_TEXT scored 0/5 on the dopely fixture —
 * it breaks the palette rows apart and loses the hex column's line context.
 */
export const OCR_PAGE_SEG_MODE = PSM.AUTO;

/**
 * Whitelist OFF. It is not inert under LSTM (it changed output in 10 of 18
 * matched pairs), but it never improved the chosen config and it turns label
 * text into hex-shaped false positives ("BEST FOR" -> FAEE01). Empty = off.
 */
export const OCR_CHAR_WHITELIST = '';

/** Crop upscale target. 1200 is a tuned peak, not a plateau — see the memo. */
export const OCR_MIN_CROP_WIDTH = 1200;
/** Optional second pass; union the hex tokens. Adds ~440ms, recovers #D0D5DD. */
export const OCR_SECOND_PASS_WIDTH = 1900;
```

Applied once after worker creation:

```ts
await worker.setParameters({
  tessedit_pageseg_mode: PSM.AUTO,
  tessedit_char_whitelist: '',
});
```

## Reproducing

`sharp` is used only for image prep and is deliberately **not** a project dependency. Install it anywhere outside the repo and point the script at it:

```bash
mkdir -p /tmp/spike-sharp && cd /tmp/spike-sharp && npm init -y && npm i sharp
cd /path/to/ui_rover
SPIKE_SHARP_DIR=/tmp/spike-sharp node scripts/spike/ocr-spike.mjs   # --dump writes previews to public/ocr-spike/
```

## Browser follow-up (2026-09-16)

The numbers above are Node + `sharp`. Re-measured in the shipping runtime — Chrome, tesseract.js v7, LSTM, whitelist off, canvas crop — on the same fixture, counting exact hits among `#101828 #2F6BFF #475467 #D0D5DD #FFFFFF`:

| crop | width | PSM | hits |
|---|---|---|---|
| full card (blob bbox, no padding) | 1200 px | 3 (AUTO) | 1/5 |
| full card (blob bbox, no padding) | 1200 px | 4 | 2/5 |
| hand-tuned spike rect | 1200 px | 3 (AUTO) | 3/5 |
| **right 45 % column of the card** | **1000 px** | **3, 4 and 6 alike** | **4/5** |
| auto-crop padded 2 % | 1200 / 1500 / 1900 px | 3 (AUTO) | 0/5 |
| right column of the padded auto-crop | 1000 px | 3 (AUTO) | 2–3/5 |

Three things changed the pipeline:

1. **Padding hurts.** The 2 % pad that looked harmless in Node reads **0/5** in the browser at every width tried. `AUTO_CROP_PADDING` is now `0` and the auto-crop is the bare blob bbox (containment-scored selection and the 1.5 % area floor both stay).
2. **Geometry beats width.** The 1900 px second pass over the *same* rect never recovered a code the 1200 px pass missed, so it is gone. What works is reading a different *part* of the card: the right 45 % (`x` from `rect.x + 0.55·rect.w`, same `y`/`h`) at 1000 px reads 4/5 in ~220 ms, and identically under PSM 3, 4 and 6 — the column keeps enough of each label for line context without the card's left-hand noise. PSM stays `AUTO`.
3. **Tesseract splits the `#`.** Row strips under PSM 7 read e.g. `O Brand Blue # 2F6BFF` — the hash is emitted as its own word, so `parseHexTokens` saw neither `#` nor `2F6BFF` as a code.

**Resulting rule:** unpadded card bbox → two passes, unioned by hex (higher confidence wins), stopping early at 5 exact codes — `card` at 1200 px, then `right-column` (`xFrac 0.55`, `wFrac 0.45`) at 1000 px. Plus the `#` join: a standalone `#` word merges with the next word on the same line when they are within ~1.5× the word height and the pair spells a 3- or 6-digit hex; the joined candidate keeps the digits' confidence and a bbox spanning both.

Passes live in `OCR_PASSES` (`src/features/palette/read/ocrConfig.ts`); `OCR_SECOND_PASS_WIDTH` is removed. Note that `cropToBlob` floors its output at `OCR_CROP_WIDTH`, so the 1000 px pass must pass `minWidth` alongside `targetWidth` or it is silently upscaled back to 1200.

**Known miss:** `#D0D5DD` is not read exactly on this fixture — it comes back as `#D0DsSDD`; the shipped pipeline surfaces it only as an unchecked **repaired** candidate in the review panel (4 exact + 1 repaired = the "5 codes" the UI reports as "4 (+1 uncertain)"). The shipped result on this fixture is 4/5 exact, 0 false positives.
