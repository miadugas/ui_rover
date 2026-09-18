# Code Review: Component Capture (+ Optional URL)

**Review Date**: 2026-09-17  
**Version**: `0.3.0`  
**Files Reviewed**:

- `src/app/EntryPage.test.tsx`
- `src/app/EntryPage.tsx`
- `src/app/LandingPage.test.tsx`
- `src/app/LandingPage.tsx`
- `src/app/Layout.test.tsx`
- `src/app/Layout.tsx`
- `src/app/LibraryPage.test.tsx`
- `src/app/LibraryPage.tsx`
- `src/components/chipStyles.ts`
- `src/features/capture/CaptureCard.test.tsx`
- `src/features/capture/CaptureCard.tsx`
- `src/features/capture/KindToggle.test.tsx`
- `src/features/capture/KindToggle.tsx`
- `src/features/capture/UrlField.test.tsx`
- `src/features/capture/UrlField.tsx`
- `src/features/components/ComponentCapture.test.tsx`
- `src/features/components/ComponentCapture.tsx`
- `src/features/components/ComponentForm.test.tsx`
- `src/features/components/ComponentForm.tsx`
- `src/features/components/ComponentStrip.test.tsx`
- `src/features/components/ComponentStrip.tsx`
- `src/features/components/componentTags.test.ts`
- `src/features/components/componentTags.ts`
- `src/features/components/cropComponent.test.ts`
- `src/features/components/cropComponent.ts`
- `src/features/library/EntryCard.test.tsx`
- `src/features/library/EntryCard.tsx`
- `src/features/library/ExportImport.test.tsx`
- `src/features/library/ExportImport.tsx`
- `src/features/library/FilterBar.test.tsx`
- `src/features/library/FilterBar.tsx`
- `src/features/library/ImageCarousel.tsx`
- `src/features/library/filters.test.ts`
- `src/features/library/filters.ts`
- `src/lib/db.test.ts`
- `src/lib/db.ts`
- `src/lib/export.test.ts`
- `src/lib/export.ts`
- `src/lib/platform.test.ts`
- `src/lib/platform.ts`
- `src/types.ts`

**Plan**: `docs/1-plans/F_0.3.0_component-capture.plan.md`

---

## Executive Summary

This change adds first-class component capture, component filtering and provenance, optional post URLs, schema-v2 persistence, cascade deletion, and parent-aware import/export. Round 1 identified one major correctness issue and two minor plan-conformance issues; all three were addressed and the second review found no new issues.

APPROVED

---

## Changes Overview

Design screenshots can now be cropped into component entries with fixed component chips, free tags, notes, parent provenance, thumbnails, and optional palette extraction. The change also makes URLs optional, adds parent-aware library and entry-page surfaces, introduces a version-aware IndexedDB upgrade and cascade deletion, and resolves imported components against parents before writing. The final implementation snapshots the capture target for the complete crop flow, preserves parent context across UI surfaces, and displays the parent thumbnail on component pages.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Capture target could change mid-flow and corrupt provenance** — `src/app/EntryPage.tsx:312`, `src/app/EntryPage.tsx:422`, `src/features/library/ImageCarousel.tsx:40`, `src/features/components/ComponentCapture.tsx:46`, `src/features/components/ComponentCapture.tsx:105`. Round 1 found that changing carousel images after confirming a crop could combine image A’s pixels and rectangle with image B’s `parentImageId`. **Disposition: Addressed.** `EntryPage` now snapshots the selected image when capture starts, disables carousel selection during capture, and passes the snapshot to `ComponentCapture`; `ComponentCapture` also retains its initial image target for its full lifetime.

### Minor Issues

- **Recent components lacked parent context** — `src/app/LandingPage.tsx:45`, `src/app/LandingPage.tsx:73`. Round 1 found that component entries in the Recent row called `entryTitle` without their parent, causing every component to display only “Component.” **Disposition: Addressed.** `LandingPage` now resolves parents from the loaded entries and passes the matching parent to the title helper.

- **Component pages omitted the planned parent thumbnail** — `src/app/EntryPage.tsx:179`. Round 1 found that the parent provenance surface rendered only a text link. **Disposition: Addressed.** `ParentLine` now loads the parent’s thumbnail and renders it inside the parent link, while preserving the missing-parent fallback.

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

The review converged after two rounds. All findings were addressed; no findings were overridden or left open. The final reported gate was lint clean, type-check clean, 408 tests passing, build clean, with the round-one manual browser checks retained.

---

## Release verification addendum (2026-09-17)

**Sol (Codex) release verification — 4 Minor, all resolved before release:**
1. No inline error when the selected image's data is missing → `useImageBlob` now reports `loading | ready | missing`; `EntryPage` shows a `role="alert"` explanation and keeps capture disabled (tested, incl. no alert while loading).
2. Components-strip thumbs load eagerly while docs claimed intersection gating → recorded as intentional (small, always on screen, parent page only); plan and ARCHI §17 corrected. The library grid stays gated.
3. `EmptyState` checkbox ticked without a change → the copy is deliberately unchanged (a component cannot exist without a post); plan corrected.
4. Plan inventories missing review-driven scope → `ImageCarousel.tsx` (`disabled`), `chipStyles.ts`, the capture-lock / Recent-parent / ParentLine-thumbnail regressions and the tutorial added to the plan.

**Opus final review — SHIP with observations** (nothing Critical/Major). Resolved: two stale ARCHI claims (`StorageBanner` reads `storageFallbackReason()`; import result line includes orphans); `componentTags` now rejected on non-components in import validation and `createEntry` (tested). Left as known gaps: `cropComponent`'s encode path is Canvas-bound and manual-only (only `pixelRect` is unit-tested); `cropMimeType()` duplicates `imageMeta`'s private probe; Replace-import does not dedupe duplicate ids inside one file (pre-existing, aborts the import); no re-crop of `sourceRect` after save.

**Manual browser check (built-in Chromium pane, dev server, real IndexedDB):** v1 → v2 upgrade kept the 3 existing entries (`storageFallbackReason()` = `none`); URL-less design capture saved as "Untitled capture" with no source link or platform badge; two components captured through `CropTool` (WebP 462×584 *card*, 212×118 *button*) with `parentId`/`parentImageId`/`sourceRect` set and `sourceImageId` = their own image, both listed in the parent strip; library kind *Component* → 2, type *Button* → 1; the component page shows the parent link and no nested capture; Extract palette on the card component returned `paletteSource: 'ocr'` (5 codes) with provenance intact; deleting the parent cascaded both children (6 → 3 entries, 0 orphans). **Not run:** Firefox.

**Final gate after all fixes:** lint clean · `npx tsc -b --noEmit` clean · 412 tests / 46 files · build clean.
