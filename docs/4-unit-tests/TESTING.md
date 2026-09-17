# Testing

## Test Framework

Vitest + jsdom + `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` + `fake-indexeddb`, installed (see `docs/ARCHI.md` §3 for versions). Config lives in `vite.config.ts`'s `test` block (`environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`, `globals: false`) — there is no separate `vitest.config.ts`.

## Running Tests

```bash
npm test                          # run the whole suite once
npx vitest run <path/to/file>     # run one file, e.g. src/lib/url.test.ts
npm run test:watch                # watch mode
```

`globals: false` — every test file imports `describe`/`it`/`expect`/`vi` explicitly from `vitest`, and Testing Library's `cleanup` runs via an explicit `afterEach(cleanup)` in each component test file (no auto-cleanup import).

No coverage provider is configured; add one when a threshold is actually needed.

## Test Organization

Co-located: `src/**/*.test.ts(x)` next to the unit under test — there is no separate `__fixtures__/` directory and no `.png` fixtures. Palette/image tests build **synthetic in-test pixel buffers** (solid blocks of known colors as `Uint8ClampedArray`) instead, because jsdom has no Canvas — see `src/features/palette/quantize.test.ts` and `roles.test.ts` for the pattern.

## Writing Tests

- **Pure functions first.** `lib/url.ts`, `lib/export.ts`'s validators, `features/palette/{quantize,roles,containMap}.ts`, `features/palette/mock/spec.ts` validators, `features/capture/imageLimits.ts` are all plain functions over data — test them directly with synthetic inputs, no DOM.
- **Canvas-bound code is not unit-tested.** `downsample.ts`, `samplePixel.ts`, and `imageMeta.ts`'s `makeThumb`/`readImageMeta` decode real bitmaps and draw to a real 2D context; jsdom can't do either. These are verified by the manual browser check (see below), not by `*.test.ts`. Anything worth unit-testing from that path has been pulled out into a pure helper instead (e.g. `mapContainClick` out of the sampling click handler).
- **jsdom stubs** live in `src/test/setup.ts`, loaded via `setupFiles`: a `createImageBitmap` stub (returns `{width:1, height:1, close(){}}` — intake code only reads dimensions), an object-URL registry (`URL.createObjectURL`/`revokeObjectURL`, since jsdom has neither), and an opt-in 2D canvas stub (`installCanvas2dStub(fill)`, exported from `setup.ts`) for the rare test that needs `getContext('2d')` to return *something* rather than testing the pure quantizer directly.
- **`fake-indexeddb/auto`** is imported once in `setup.ts`, so `lib/db.ts` tests exercise the real `idb` API against a real (fake) IndexedDB — no manual IndexedDB mocking.
- **Fake-timer race tests.** `useDebouncedPatch` and `MockPanel` have tests built around `vi.useFakeTimers()` to prove: flush fires on unmount/visibilitychange-hidden/pagehide, a failed write is retained and surfaced via `error` with `retry` reissuing the merged patch, and `discard()`'s generation counter stops a write that was already in flight from landing after the fact. Use this pattern for anything with a debounce, a race between a pending write and a replacing action, or a component-teardown flush.
- **Component tests** (Testing Library, `@testing-library/user-event`): interaction states over DOM/ARIA, e.g. `UrlField` (invalid/valid+badge/duplicate→disabled+link), `KindToggle` keyboard behavior, `Block`+`TouchpointPopover` (open/pick/override/Esc-restores-focus), `SwatchStrip` (remove/add-hex/reset).

## OCR / Read Pipeline (v0.2.0)

`src/features/palette/read/` follows the same pure-vs-Canvas/worker split as the rest of the palette code:

- **Pure, directly tested with synthetic inputs**: `hexTokens.ts` (strict `#`-hex match, `#`+word join within 1.5× word-height, bare 6-hex tokens accepted only near a synthetic blob bbox, ≤2-character repair, dedupe + reading order, cap at 12), `swatchBlobs.ts` (synthetic `Uint8ClampedArray` buffers — five colored squares on a white page → five blobs in area order; a background/chrome band touching ≥2 edges over the area cap is dropped; a small full-bleed swatch under the cap survives; thin rules rejected by aspect ratio), `blobSpace.ts` (mapping a detector-buffer bbox into a pass's own pixel space), `cropRect.ts` (clamp, from-points, nudge, `MIN_CROP_EDGE`).
- **`ocrWorker.ts` — mocked `tesseract.js`.** `vi.mock('tesseract.js', async (importOriginal) => ({ ...(await importOriginal()), createWorker: vi.fn() }))` keeps the real `OEM`/`PSM` enum exports (so `ocrConfig.ts` still imports real values) while replacing `createWorker` with a fake worker (`setParameters`/`recognize`/`terminate` as `vi.fn()`s). Tests use `vi.useFakeTimers()` to verify the lazy-singleton lifecycle: one creation serves concurrent callers, idle teardown fires at `WORKER_IDLE_MS` (60 s) and is cancelled by a new call, and an abort mid-`recognize()` rejects with `ReadCancelledError` and tears the worker down without resurrecting a since-replaced singleton (the generation counter).
- **`readPalette.test.ts` — orchestration, everything mocked.** `downsample`, `extract`, `cropToBlob`/`downscaleForOcr`, `ocrHexCodes`, and `detectSwatchBlobs` are all `vi.mock`ed so the test only exercises `readPalette`'s own control flow: auto-crop selection (largest non-edge blob ≥1.5% area containing the most small blobs, unpadded), the two-pass union over `OCR_PASSES` and its early stop at `OCR_PASS_TARGET_CODES`, the ocr → blobs → quantize fallthrough at each threshold, `OcrUnavailableError` → `ocrUnavailable: true` continuing to the next detector, and cancellation between phases rejecting with `ReadCancelledError` with nothing applied.
- **`cropToBlob.ts`/`downscaleForOcr` — Canvas-bound, manual-only.** Like `downsample`, jsdom can't decode+draw a real bitmap; covered by the manual browser check below.
- **`CropTool.test.tsx`/`ReadPalettePanel.test.tsx`** — component tests: drag produces a normalized rect via a mocked `getBoundingClientRect`, arrow-key nudge, Esc cancels; the review panel lists candidates with source badges, unchecking excludes a hex from Apply/Append, and the OCR-unavailable summary line renders.

### Manual fixture

`docs/6-memo/fixtures/dopely-calm-saas.png` (the "Calm SaaS" palette card, referenced by `docs/6-memo/ocr-spike.md`) is the fixture for the manual browser check below. Ground truth: `#101828 #2F6BFF #475467 #D0D5DD #FFFFFF`. The memo's Node spike hypothesized a 5/5 two-pass union, but its "Browser follow-up" section — the measured truth in the shipping runtime — corrected that: the card-body pass at 1200px plus the right-45%-column pass at 1000px reads **4/5 exact, 0 false positives**; `#D0D5DD` comes back as `#D0DsSDD`, too long to repair, and is surfaced only as an unchecked repaired candidate. Expect **≥4 exact matches** on this fixture; a run that also recovers `#d0d5dd` isn't wrong, but don't treat 4/5 as a regression — see the memo before changing `ocrConfig.ts`'s tuned values (§5.9 of ARCHI.md).

## What Is Manual-Only

Per the TRIP-2 gate rule, a manual browser pass is required for anything Canvas-bound or requiring a real image pipeline: paste a real IG URL + screenshot and confirm it saves/reloads/repaints; repeat for Threads; try a non-image paste; pick-from-image on one portrait and one landscape screenshot, sampling a known solid area and confirming the hex; switch every mock template, reload, and confirm the selection and its overrides survive. Export download (Blob URL + anchor click) — verify in the browser; unit tests cover the panel's flow with `downloadExport` mocked. No E2E suite exists or is planned for v1.

The v0.2.0 read pipeline adds its own manual checks (dopely fixture above): (1) save a palette entry from the fixture with no manual crop — auto-crop finds the card and OCR yields the expected codes (§ above); (2) draw a manual crop to the card via `CropTool`, re-read — same result, faster; (3) a swatch-only post with no printed hex text — falls to blobs; (4) DevTools Network filtered to `ocr/` shows same-origin requests only, and none on a second read in the same session (`cacheMethod: 'none'`, HTTP cache only); (5) cancel mid-read on the entry page leaves the palette unchanged, cancel during Capture's save still creates the entry via the quantize fallback; (6) Firefox once, to confirm the worker + wasm load outside Chrome.

## Current Counts

Last recorded via `npx vitest run` (2026-09-16): **38 test files, 311 tests, all passing.** Re-run the command above to refresh this before relying on it for a release decision.
