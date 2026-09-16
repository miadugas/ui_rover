# Code Review: ui_rover MVP — Capture, Palette Mock, Library

**Review Date**: 2026-09-16  
**Version**: `0.1.0`  
**Files Reviewed**: Git metadata was unavailable; the current-tree `src/` inventory and plan-declared deletions were reviewed.

- `src/app/App.test.tsx`
- `src/app/App.tsx`
- `src/app/EntryPage.test.tsx`
- `src/app/EntryPage.tsx`
- `src/app/LandingPage.tsx`
- `src/app/Layout.tsx`
- `src/app/LibraryPage.test.tsx`
- `src/app/LibraryPage.tsx`
- `src/components/Badge.tsx`
- `src/components/Button.tsx`
- `src/components/Field.test.tsx`
- `src/components/Field.tsx`
- `src/components/Popover.test.tsx`
- `src/components/Popover.tsx`
- `src/features/capture/CaptureCard.test.tsx`
- `src/features/capture/CaptureCard.tsx`
- `src/features/capture/ImageTray.tsx`
- `src/features/capture/KindToggle.test.tsx`
- `src/features/capture/KindToggle.tsx`
- `src/features/capture/UrlField.test.tsx`
- `src/features/capture/UrlField.tsx`
- `src/features/capture/imageLimits.test.ts`
- `src/features/capture/imageLimits.ts`
- `src/features/capture/imageMeta.ts`
- `src/features/capture/useImageIntake.test.ts`
- `src/features/capture/useImageIntake.ts`
- `src/features/library/DeviceFrame.tsx`
- `src/features/library/EmptyState.tsx`
- `src/features/library/EntryCard.test.tsx`
- `src/features/library/EntryCard.tsx`
- `src/features/library/ExportImport.tsx`
- `src/features/library/FilterBar.test.tsx`
- `src/features/library/FilterBar.tsx`
- `src/features/library/ImageCarousel.tsx`
- `src/features/library/NoteField.tsx`
- `src/features/library/TagEditor.test.tsx`
- `src/features/library/TagEditor.tsx`
- `src/features/library/filters.test.ts`
- `src/features/library/filters.ts`
- `src/features/library/useThumbUrl.ts`
- `src/features/palette/containMap.test.ts`
- `src/features/palette/containMap.ts`
- `src/features/palette/downsample.ts`
- `src/features/palette/extract.test.ts`
- `src/features/palette/extract.ts`
- `src/features/palette/mock/Block.test.tsx`
- `src/features/palette/mock/Block.tsx`
- `src/features/palette/mock/Frame.tsx`
- `src/features/palette/mock/MockPanel.test.tsx`
- `src/features/palette/mock/MockPanel.tsx`
- `src/features/palette/mock/SwatchStrip.test.tsx`
- `src/features/palette/mock/SwatchStrip.tsx`
- `src/features/palette/mock/TemplatePicker.tsx`
- `src/features/palette/mock/TouchpointPopover.test.tsx`
- `src/features/palette/mock/TouchpointPopover.tsx`
- `src/features/palette/mock/WireframeMock.test.tsx`
- `src/features/palette/mock/WireframeMock.tsx`
- `src/features/palette/mock/spec.test.ts`
- `src/features/palette/mock/spec.ts`
- `src/features/palette/mock/templates/blog.ts`
- `src/features/palette/mock/templates/classic.ts`
- `src/features/palette/mock/templates/components.ts`
- `src/features/palette/mock/templates/dashboard.ts`
- `src/features/palette/mock/templates/documentation.ts`
- `src/features/palette/mock/templates/ecommerce.ts`
- `src/features/palette/mock/templates/index.ts`
- `src/features/palette/mock/templates/portfolio.ts`
- `src/features/palette/mock/templates/saasLanding.ts`
- `src/features/palette/mock/templates/sidebar.ts`
- `src/features/palette/mock/templates/threeColumn.ts`
- `src/features/palette/mock/templates/twoColumn.ts`
- `src/features/palette/quantize.test.ts`
- `src/features/palette/quantize.ts`
- `src/features/palette/roles.test.ts`
- `src/features/palette/roles.ts`
- `src/features/palette/samplePixel.ts`
- `src/features/palette/useImageUrl.ts`
- `src/index.css`
- `src/lib/db.test.ts`
- `src/lib/db.ts`
- `src/lib/export.test.ts`
- `src/lib/export.ts`
- `src/lib/platform.ts`
- `src/lib/url.test.ts`
- `src/lib/url.ts`
- `src/lib/useDebouncedPatch.test.ts`
- `src/lib/useDebouncedPatch.ts`
- `src/lib/useLibrary.ts`
- `src/main.tsx`
- `src/test/setup.ts`
- `src/types.ts`
- `src/App.tsx` — deleted
- `src/assets/hero.png` — deleted
- `src/assets/vite.svg` — deleted

**Plan**: `docs/1-plans/F_0.1.0_mvp-capture-library.plan.md`

---

## Executive Summary

This release implements the client-only capture, IndexedDB library, palette extraction, editable wireframe templates, design-entry workflow, and JSON export/import described by the plan. Across four implementation-review rounds and two release-verification rounds, every code finding was addressed and the documentation-timing objection was accepted under the project’s release workflow.

APPROVED

---

## Changes Overview

The release replaces the starter application with a three-route React SPA for capturing Instagram and Threads references, storing screenshots locally, extracting and editing palettes, and browsing a searchable library. It adds atomic IndexedDB persistence with an in-memory fallback, debounced and retryable editing, eleven wireframe templates, image sampling, framed design entries, and validated atomic export/import. The final gate passed lint, TypeScript, 181 tests across 28 files, production build, and the supplied manual browser checks.

---

## Findings

### Critical Issues

None.

### Major Issues

1. **Extraction-fallback warning was lost after navigation** — `src/features/capture/CaptureCard.tsx:118-123`, `src/app/EntryPage.tsx:35-40`, `src/app/EntryPage.tsx:70`, `src/app/EntryPage.tsx:144-153`. Capture now transfers the warning through router state, and EntryPage renders it as a dismissible status message. Verified by `src/features/capture/CaptureCard.test.tsx:87-109` and `src/app/EntryPage.test.tsx:179-191`. **Disposition: Addressed.**

2. **Design entries lost their frame and extraction action after the first extraction** — `src/app/EntryPage.tsx:186-215`, `src/features/palette/mock/MockPanel.tsx:224-231`. Design entries now retain their device frame, while MockPanel provides re-extraction after colors exist. Verified by `src/app/EntryPage.test.tsx:125-153` and `src/app/EntryPage.test.tsx:193-225`. **Disposition: Addressed.**

3. **Failed debounced writes discarded the pending patch without actionable recovery** — `src/lib/useDebouncedPatch.ts:35-61`, `src/app/EntryPage.tsx:220-226`, `src/features/palette/mock/MockPanel.tsx:251-258`. Rejected writes now restore the pending patch beneath later changes, retain dirty state, expose the error, and support Retry. Verified by `src/lib/useDebouncedPatch.test.ts:71-119`. **Disposition: Addressed.**

4. **Pending palette autosave could overwrite a completed re-extraction** — `src/features/palette/mock/MockPanel.tsx:170-201`, `src/lib/useDebouncedPatch.ts:65-73`. MockPanel is now the single palette persistence owner for populated design entries; successful extraction discards the superseded draft immediately before queuing and flushing the replacement. Verified by `src/features/palette/mock/MockPanel.test.tsx:116-176`. **Disposition: Addressed.**

5. **Failed extraction discarded an unsaved palette edit** — `src/features/palette/mock/MockPanel.tsx:175-186`. Extraction now completes successfully before `discard()` is called, so failure leaves the pending draft and its error state intact. Verified by `src/features/palette/mock/MockPanel.test.tsx:178-223`. **Disposition: Addressed.**

6. **A superseded in-flight write could restore stale dirty or error state after discard** — `src/lib/useDebouncedPatch.ts:46-60`, `src/lib/useDebouncedPatch.ts:67-72`. Flushes now capture a generation, while `discard()` advances it; stale resolve and reject handlers therefore cannot mutate replacement state. Verified by `src/lib/useDebouncedPatch.test.ts:121-188`. **Disposition: Addressed.**

7. **Template selection reported false persistence success** — `src/features/palette/mock/MockPanel.tsx:117-140`, `src/features/palette/mock/MockPanel.tsx:262-268`. A failed immediate write now restores the stored template, retains the requested template for retry, and displays an actionable alert. Verified by `src/features/palette/mock/MockPanel.test.tsx:226-267`. **Disposition: Addressed.**

8. **Delete failure caused an unhandled rejection with no user feedback** — `src/app/EntryPage.tsx:126-140`, `src/app/EntryPage.tsx:229-245`. Delete failures are caught; the entry and confirmation UI remain, an alert is shown, and navigation occurs only after successful deletion. Verified by `src/app/EntryPage.test.tsx:248-268`. **Disposition: Addressed.**

### Minor Issues

1. **Release documentation was not synchronized during implementation review** — `docs/1-plans/F_0.1.0_mvp-capture-library.plan.md:215`, `docs/1-plans/F_0.1.0_mvp-capture-library.plan.md:275-281`. The implementer established that ARCHI, TESTING, changelog, and project CLAUDE updates belong to the immediately following release Documentation Sync step. The review accepted that workflow boundary and did not require implementation-phase duplication. **Disposition: Accepted with override.**

2. **Post-save focus did not move to the entry heading** — `src/features/capture/CaptureCard.tsx:118-123`, `src/app/EntryPage.tsx:42-45`, `src/app/EntryPage.tsx:78-85`, `src/app/EntryPage.tsx:162-168`. Capture now passes `focusHeading`, and EntryPage focuses its `tabIndex="-1"` heading only for that route state. Save-originated and ordinary visits are covered by `src/app/EntryPage.test.tsx:270-284`. **Disposition: Addressed.**

3. **The plan specified React Router v7 while the release installed v8.4** — `package.json:19`, `docs/1-plans/F_0.1.0_mvp-capture-library.plan.md:46`. The plan now records the resolved v8.4 dependency and notes that the used API surface remains compatible. **Disposition: Addressed.**

4. **The plan’s file inventory omitted supporting production modules** — `docs/1-plans/F_0.1.0_mvp-capture-library.plan.md:203-209`. The inventory now includes `imageLimits`, `imageMeta`, `platform`, `useImageUrl`, `useThumbUrl`, and `filters`, with their architectural purposes documented. **Disposition: Addressed.**

5. **Test Impact and Documentation Impact omitted recovery behavior added during review** — `docs/1-plans/F_0.1.0_mvp-capture-library.plan.md:264-280`. The plan now records failed-write retention, retry, discard generations, single-owner palette persistence, extraction races, template/delete errors, router-state notices, and post-save focus coverage. **Disposition: Addressed.**

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — Passed
- [x] 2. Code Quality — Passed
- [x] 3. Architectural Compliance — Passed
- [x] 4. Client-Only & Privacy — Passed
- [x] 5. Data & Persistence — Passed
- [x] 6. UI & Styling — Passed
- [x] 7. Image & Color Pipeline — Passed
- [x] 8. Error Handling — Passed
- [x] 9. Security — Passed
- [x] 10. Performance — Passed

---

## Verdict

**APPROVED**

All implementation and release-verification findings are resolved. The ARCHI, TESTING, changelog, and project CLAUDE updates were explicitly assigned to the release Documentation Sync step and accepted as outside the implementation-review gate; no code findings remain open. Final verification reported clean lint and TypeScript checks, 181 passing tests across 28 files, a successful production build, and passing manual browser flows.

**Post-review release polish (Opus final review observations, 2026-09-16):** `downloadExport` now revokes its Blob URL on a deferred tick (Firefox download safety), `ExportImport.test.tsx` added (3 tests), unreferenced `public/icons.svg` removed. Final gate after polish: lint clean · `tsc -b --noEmit` clean · 184 tests / 29 files · build clean. Left as follow-ups: hex regex duplicated in three files; purple scaffold favicon.
