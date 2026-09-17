# Code Review: Read the Palette — OCR, Crop, and Swatch-Blob Fallback

**Review Date**: 2026-09-16  
**Version**: 0.2.0  
**Files Reviewed**:

- `src/features/palette/read/**`
- `src/features/palette/mock/MockPanel.tsx`
- `src/features/capture/CaptureCard.tsx`
- `src/app/EntryPage.tsx`
- `src/lib/db.ts`
- `src/lib/export.ts`
- `src/types.ts`
- `scripts/copy-ocr-assets.mjs`

**Plan**: `docs/1-plans/F_0.2.0_read-the-palette.plan.md`

---

## Executive Summary

This change adds client-side OCR, automatic and manual cropping, swatch-blob detection, quantization fallback, review controls, cancellation, and persisted palette provenance. Three review rounds identified correctness, cancellation, state synchronization, accessibility, messaging, and documentation concerns; all code findings were addressed, with documentation intentionally deferred to TRIP-3.

APPROVED

---

## Changes Overview

The palette pipeline now prioritizes locally bundled Tesseract OCR, falls back to detected swatch regions, and retains the existing quantizer as the final fallback. Capture and entry flows expose progress, cancellation, cropping, candidate review, replace/append actions, and persistent `paletteSource` and crop metadata. IndexedDB remains schema version 1, while export/import validates the new optional fields without breaking the v1 format.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Detector and OCR bounding boxes used incompatible coordinate spaces** — `src/features/palette/read/blobSpace.ts:41`, `src/features/palette/read/readPalette.ts:202`. Bare hex tokens could not reliably satisfy the near-swatch validation because detector boxes were measured at ≤240px while OCR boxes used cropped 1000/1200px inputs. **Disposition: addressed.** Blob boxes are now transformed into each OCR pass’s coordinate space.

- **Cancellation did not interrupt worker loading or recognition** — `src/features/palette/read/ocrWorker.ts:155`, `src/features/palette/read/ocrWorker.ts:188`. Abort signals were previously checked only around awaited worker operations. **Disposition: addressed.** Worker creation, parameter setup, and recognition now race the abort signal; teardown removes listeners and uses generation protection to prevent stale worker resurrection.

- **Crop state had multiple unsynchronized owners** — `src/features/palette/mock/MockPanel.tsx:154`, `src/features/palette/mock/MockPanel.tsx:257`, `src/features/palette/mock/MockPanel.tsx:413`. Reads could consume the stored crop while the editor displayed a newer rect. **Disposition: addressed.** Persisted `crop` and in-progress `editorRect` now have separate responsibilities, and reads consume only the persisted/optimistic crop.

- **Failed confirmed-crop writes did not restore persisted state** — `src/features/palette/mock/MockPanel.tsx:392`. The attempted rect was previously captured as both the new value and rollback value, allowing reads to use a crop IndexedDB had rejected. **Disposition: addressed.** `saveCrop` captures the prior persisted crop, applies optimistically, restores it on rejection, and retains the attempted rect for Retry.

### Minor Issues

- **Review-panel focus was lost after Apply, Append, or Dismiss** — `src/features/palette/read/ReadPalettePanel.tsx:123`, `src/features/palette/read/ReadPalettePanel.tsx:177`. Removing the focused review control left keyboard focus on the document body. **Disposition: addressed.** Review-to-idle transitions restore focus to the Read palette button.

- **Quantize fallback reported the wrong detector** — `src/features/palette/read/ReadPalettePanel.tsx:50`. An unavailable OCR engine could produce “using swatch shapes” even when quantization won. **Disposition: addressed.** Summary text now branches on the actual winning source.

- **Release documentation remained at v0.1.0 during implementation review** — `docs/1-plans/F_0.2.0_read-the-palette.plan.md:169`, `docs/1-plans/F_0.2.0_read-the-palette.plan.md:235`. **Disposition: accepted with override.** README, architecture, testing guidance, CLAUDE conventions, and changelog synchronization are intentionally deferred to the immediately following TRIP-3 documentation step.

- **A stale crop image ID could override the current source image** — `src/features/palette/mock/MockPanel.tsx:106`, `src/features/palette/mock/MockPanel.tsx:392`. Passing a stored crop through object spread could retain the previous source’s `imageId`, causing the reader to ignore the crop. **Disposition: addressed.** Crop geometry is stripped with `pickRect`, and the current source image ID is applied last.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Code Quality — passed
- [x] 3. Architectural Compliance — passed
- [x] 4. Client-Only & Privacy — passed
- [x] 5. Data & Persistence — passed
- [x] 6. UI & Styling — passed
- [x] 7. Image & Color Pipeline — passed
- [x] 8. Error Handling — passed
- [x] 9. Security — passed
- [x] 10. Performance — passed

---

## Verdict

**APPROVED**

All code findings from the three-round review were resolved. Final supplied verification was clean: lint with zero warnings, TypeScript project-reference checking, 311 passing tests, production build, and a browser check on the dopely fixture (4 codes exact, `#d0d5dd` as a repaired candidate) confirming 5/5 Dopely codes were read, applied, persisted, and retained after reload. Focus restoration was also manually verified. Documentation synchronization remains an explicitly accepted TRIP-3 follow-up.

---

## Release verification addendum (2026-09-16)

**Sol (Codex) release verification — 4 Minor, all resolved before release:**
1. Planned "crop first, with Skip crop" flow not built → recorded as an intentional divergence in the plan (§8): the auto-crop made a crop-first step a redundant click; a separate **Crop** button covers overrides.
2. Manual gate under-evidenced → run and recorded below.
3. Plan file/test inventories missing review-driven additions (`blobSpace.ts`, `readProgressLabel.ts`, `db.applyPatch`) → inventories updated in the plan.
4. `package-lock.json` root version still `0.1.0` → regenerated (`npm install --package-lock-only`), now `0.2.0`.

**Manual browser check (built-in Chromium pane, dev server, real fixture `docs/6-memo/fixtures/dopely-calm-saas.png`):**
- Auto-crop read, no manual crop: "Read 5 hex codes from the card" — `#101828 #2f6bff #475467 #ffffff` exact, `#d0d5dd` offered as *repaired* (unchecked); Apply persists `paletteSource: 'ocr'`; reload keeps the palette; focus returns to *Read palette* after dismiss.
- Manual crop: stored crop honored after reload (button reads *Edit crop*, no "detected card" line), 5 codes read.
- Swatch-only synthetic card (no text): source `blobs`, five swatch colors + card white.
- Cancel on the entry page during "Reading…": palette unchanged, panel back to idle, no review opened.
- Cancel during save ("Cancel read" while "Detecting swatches…"): entry still created with the quantize palette (`paletteSource: 'quantize'`).
- OCR assets served same-origin (`curl` 200 for `worker.min.js`, `tesseract-core-relaxedsimd-lstm.wasm.js`, `eng.traineddata.gz`); worker-initiated fetches are not visible in the pane's network log, so same-origin is asserted by `ocrConfig.test.ts` + curl rather than by observation.
- **Not run:** Firefox (no Firefox available to the agent) — Mia to verify the worker + wasm load once.
- Observation (not a defect in an in-app path): a crop written to IndexedDB *outside* `MockPanel` while the entry page is open is not picked up live; `MockPanel` is the single writer in-app, and reload seeds correctly.
