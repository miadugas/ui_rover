# ui_rover Architecture Documentation

## 1. How to Read This Document

This describes ui_rover **v0.1.0 as built** — the capture → palette/mock → library MVP (`docs/1-plans/F_0.1.0_mvp-capture-library.plan.md`). No section is "(planned)" anymore; when the next feature lands, update the affected sections per `docs/ARCHI-rules.md`. Audience: Mia + any agent doing TRIP work in this repo.

## 2. Overview

ui_rover is a personal UI/UX swipe file. Mia saves Instagram and Threads posts as one of two entry kinds:

- **Design entries** — a post showing a UI/UX design. Stored as framed screenshots with tags and notes; optionally, "Extract palette" runs the same color pipeline on a chosen image and reveals the wireframe mock beneath, without changing the entry's kind.
- **Palette entries** — a post showing a color palette. Colors are extracted automatically on save and previewed on a wireframe mock (11 selectable layout templates) where every block is a touchpoint to reassign its color.

Hard constraint: **no Meta/Instagram/Threads API, no scraping.** The post URL is the bookmark key; the post image comes from a pasted or dropped screenshot. Everything runs client-side, single-user, no backend.

High-level: static SPA (HashRouter) → browser-only processing (Canvas for palette extraction) → IndexedDB for persistence (`idb`, with an in-memory fallback) → JSON export/import as the backup story.

## 3. Technology Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Runtime | Node (nvm) | 24.14.1 |
| Build | Vite | 8.3.0 |
| UI | React | 19.2.8 |
| Language | TypeScript (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`) | ~6.0.2 |
| Routing | react-router (`HashRouter`) | 8.4.0 |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | 4.3.3 |
| Storage | IndexedDB via `idb`, in-memory `Map` fallback | idb 8.0.3 |
| IDs | `ulid` | 3.0.2 |
| Lint | oxlint (react, typescript, oxc plugins) | 1.81.0 |
| Tests | Vitest + jsdom + Testing Library + fake-indexeddb | vitest 5.0.1, jsdom 29.1.1, @testing-library/react 16.3.3, @testing-library/jest-dom 7.0.1, @testing-library/user-event 14.6.7, fake-indexeddb 6.2.5 |

## 4. Project Structure

```
ui_rover/
├── index.html
├── vite.config.ts        # react() + tailwindcss() plugins; vitest `test` block (jsdom, setupFiles, globals: false)
├── tsconfig*.json         # project references: app + node
├── .oxlintrc.json
├── docs/                  # TRIP workflow: ARCHI.md, 1-plans/, 2-changelog/, 3-code-review/, 4-unit-tests/, 5-tuto/, 6-memo/
├── .claude/skills/        # project-local TRIP + codex skill copies
└── src/
    ├── main.tsx           # createRoot + StrictMode, mounts app/App
    ├── index.css          # Tailwind import + @theme tokens + wireframe utilities
    ├── types.ts           # Entry/ImageRef/RoleMap/MockTemplateId/ExportFileV1 data model
    ├── test/setup.ts       # jsdom stubs (createImageBitmap, object URLs, opt-in canvas 2D), jest-dom, fake-indexeddb/auto
    ├── lib/                # pure helpers + persistence
    │   ├── db.ts            # idb schema, atomic create/delete/import/replace, serialized updateEntry, change emitter, in-memory fallback
    │   ├── url.ts            # parsePostUrl — IG/Threads parse + normalize
    │   ├── export.ts         # export/import v1 serialization, validation, base64 chunking
    │   ├── useLibrary.ts      # hook over db.ts (entries/status/add/update/remove), subscribed to change emitter
    │   ├── useDebouncedPatch.ts  # 300ms-debounced autosave, flush/retry/discard
    │   └── platform.ts        # PLATFORM_LABEL
    ├── components/          # shared primitives: Button, Badge, Field, Popover
    ├── features/
    │   ├── capture/          # URL + image intake, save flow
    │   │   ├── CaptureCard.tsx, UrlField.tsx, ImageTray.tsx, KindToggle.tsx
    │   │   ├── useImageIntake.ts, imageLimits.ts (pure), imageMeta.ts (Canvas-bound)
    │   ├── palette/          # color extraction + role/override model
    │   │   ├── downsample.ts, quantize.ts, roles.ts, extract.ts, samplePixel.ts, containMap.ts, useImageUrl.ts
    │   │   └── mock/          # wireframe mock renderer
    │   │       ├── spec.ts, MockPanel.tsx, WireframeMock.tsx, Frame.tsx, Block.tsx
    │   │       ├── TemplatePicker.tsx, TouchpointPopover.tsx, SwatchStrip.tsx
    │   │       └── templates/  # 11 layout specs + registry (index.ts)
    │   └── library/          # grid, filters, entry detail helpers, export/import UI
    │       ├── EntryCard.tsx, FilterBar.tsx, filters.ts, useThumbUrl.ts, EmptyState.tsx
    │       ├── ImageCarousel.tsx, TagEditor.tsx, NoteField.tsx, DeviceFrame.tsx, ExportImport.tsx
    └── app/                  # routes + layout
        ├── App.tsx (HashRouter + Routes), Layout.tsx (nav + StorageBanner), LandingPage.tsx
        ├── LibraryPage.tsx, EntryPage.tsx
```

Every `.ts(x)` unit above sits beside its co-located `*.test.ts(x)` (28 test files today — see §16).

## 5. Core Architecture Principles

1. **Client-only.** No server, no auth, no third-party API. Anything that needs a token is out of scope.
2. **URL is identity.** Every entry is keyed by its normalized post URL (`by-url` unique index); duplicates are detected on paste.
3. **Screenshot is the source of truth.** Palette extraction and design mocks derive from the stored image, never from a fetch.
4. **Wireframe aesthetic.** The app's own chrome stays neutral (grays, mono labels) so saved palettes and designs read clearly against it.
5. **Feature folders over layers.** capture / palette / library own their components, hooks, and helpers.
6. **Early returns, descriptive names, complete implementations** (global style rules).
7. **One persistence owner per field group.** Palette fields (`colors`/`roleMap`/`blockOverrides`) are written only by `MockPanel` via `useDebouncedPatch`; `tags`/`note` are written only by `EntryPage` via its own `useDebouncedPatch` instance; `mockTemplate` is written immediately (not debounced) by whichever component last changed it (`CaptureCard` at save, `TemplatePicker`/`MockPanel` afterward). Two writers never share a field.
8. **Optimistic draft, dirty-gated re-seed.** Components that edit persisted state (`MockPanel`) hold a local draft and mirror it into `updateEntry` on a debounce. The draft only re-seeds from the entry's freshly-loaded state while the draft is clean (`isDirty === false`) and the entry's `updatedAt` has actually advanced — so a landing autosave write can never clobber an edit made in the meantime.

## 6. Build System & Toolchain

```bash
npm run dev             # vite dev server
npm run build            # tsc -b && vite build
npm run lint             # oxlint
npm run preview          # serve dist/
npm test                 # vitest run
npm run test:watch        # vitest (watch mode)
npx tsc -b --noEmit       # typecheck gate — the -b matters (project references; bare `tsc --noEmit` is vacuous here)
```

Output: `dist/` (static, deployable to any static host).

## 7. Configuration

No env vars, no runtime config. Tailwind v4 tokens live in `src/index.css` under `@theme`: a neutral `chrome-0…900` scale, one `accent`, `--font-mono`, `--radius-block`. Dark mode overrides the chrome scale under `@media (prefers-color-scheme: dark)` on `:root`, so every utility written against the scale (`bg-chrome-100`, `text-chrome-700`, …) keeps its meaning in both schemes with no `dark:` variants anywhere in component code. Two custom utilities: `wire` (dashed hairline for placeholder/empty blocks) and `label-mono` (mono uppercase micro-labels).

## 8. Components & UI Architecture

- **`Layout`** (`app/Layout.tsx`) — mono wordmark, nav (`Capture` / `Library`), `StorageBanner` (shown when `isInMemory()` after `openDb()` resolves), `<Outlet>`.
- **`LandingPage`** — wireframe hero + inline `CaptureCard`; "Recent" row of the last 4 entries (platform/kind badges, mini swatch strip) when any exist.
- **`CaptureCard`** — orchestrates `UrlField` (live parse + platform badge + duplicate-link), `ImageTray` (thumbnails from `useImageIntake`, reorder/remove, source-image radio), `KindToggle` (palette | design, keyboard radiogroup). Save runs `extract` first for `kind === 'palette'` (failure falls back to `design` + router-state notice), then `createEntry`, then navigates to `/entry/:id`.
- **`EntryPage`** (`EntryView`) — header (badges, source link, created date), `ImageCarousel` (thumb tabs + large view, source marker), design-only `DeviceFrame` + first-extract button, `MockPanel` (once the entry has or gains a palette), `TagEditor` + `NoteField` (both via `useDebouncedPatch`, flush on blur), delete with a two-step confirm.
- **`MockPanel`** — single owner of `colors`/`roleMap`/`blockOverrides`/`mockTemplate`; composes `SwatchStrip`, `TemplatePicker`, `WireframeMock` (→ `Frame` → `Block`), `TouchpointPopover`.
- **`LibraryPage`** — `FilterBar` (kind/platform/tag chips + text search, component state), grid of `EntryCard` (thumb read gated on `IntersectionObserver`), `EmptyState` (empty vs. no-results), `ExportImport`.
- **Shared primitives** (`src/components/`) — `Button` (variant/size), `Badge` (tone), `Field` (label/hint/error render-prop), `Popover` (a positioned `div` portaled to `document.body`, with focus trap + focus restore to the opening anchor — deliberately **not** the native `popover` attribute, so it works identically in every browser and is testable in jsdom).

## 9. State Management

- **`useLibrary()`** (`lib/useLibrary.ts`) — loads `listEntries()` on mount and on every `db.ts` change-emitter tick (`subscribe`), exposing `entries`/`status`/`add`/`update`/`remove`. No global store library.
- **`useDebouncedPatch(entryId)`** (`lib/useDebouncedPatch.ts`) — the one place debounced edits live. 300 ms merge window; flush is triggered on unmount, on `visibilitychange` → `hidden`, on `pagehide`, and by callers on field blur. A `beforeunload` listener is attached only while a patch is dirty and removed on flush. A failed write is retained (merged underneath anything queued since) and surfaced via `error`, with `retry` re-attempting the same flush. `discard()` bumps an internal generation counter so a write that was in flight when discarded can no longer land — neither its success nor its failure may touch state a caller has already replaced (used by `MockPanel` before a re-extraction write).
- **`MockPanel`**'s draft re-seeds from `entry` only while `isDirty` is false and `entry.updatedAt` has moved past the draft's last-seeded value (§5 principle 8) — see `seededAtRef` in `MockPanel.tsx`.
- **Template selection** (`TemplatePicker` → `MockPanel.handleTemplateChange`) writes `mockTemplate` via an **immediate** `updateEntry` call (not debounced — it's a discrete choice), with the local draft updated optimistically; on rejection the selection reverts and a retryable alert is shown (`saveTemplate` in `MockPanel`).
- **Router-state notices** — `CaptureCard` passes `{ state: { notice } }` to `navigate()` on an extraction-fallback save; `EntryPage` reads `location.state.notice` and offers a dismiss action that replaces the history entry with `state: null` so a refresh/back doesn't resurface it.

## 10. Routing

`HashRouter` (react-router v8) with three routes: `#/` (landing/capture), `#/library`, `#/entry/:id`. Hash routing means the app deep-links and survives reloads on any static host with zero server rewrite configuration — the deployment contract in §19.

## 11. Styling Architecture

As §7: Tailwind v4 utilities + `@theme` tokens in `src/index.css` (chrome scale, one accent, mono font, block radius), light + dark via `prefers-color-scheme` from day one. The mock's own chrome — frame silhouette (`Frame.tsx`'s `BrowserChrome`/`PhoneNotch`/bordered sheet), section labels, block skeleton (`wire` dashed rect inside `box` shapes) — is drawn from chrome tokens only and **never** from `roleMap`/`blockOverrides`, so a saved palette always reads true against neutral chrome.

## 12. Image & Color Pipeline

```mermaid
flowchart LR
  A[paste / drop / picker] --> B[validateIncomingFiles<br/>≤10 images, ≤12MB each]
  B --> C[readImageMeta + makeThumb<br/>≤320px webp/jpeg]
  C --> D[on save: extract sourceBlob]
  D --> E[downsample ≤160px<br/>Canvas]
  E --> F[quantize: median-cut<br/>8 buckets, alpha<128 skipped]
  F --> G[dedupe<br/>DEDUPE_THRESHOLD 24]
  G --> H[sortByLuminance]
  H --> I[assignRoles → RoleMap]
  I --> J["ExtractResult{colors, roleMap, degraded}"]
  D -->|zero colors| K[ExtractionError]
  K --> L[entry saved as kind:design + notice]
```

`extract(blob)` (`features/palette/extract.ts`) composes downsample → quantize → dedupe → sort → `assignRoles`; zero distinct colors is a hard failure (`ExtractionError`), 1–2 colors is a "degraded" success (`degraded: true`, UI shows a "palette too small" notice). `samplePixel(blob, nx, ny)` (normalized 0–1 coordinates over the intrinsic image) backs pick-from-image; the click-to-normalized-coordinate conversion for an `object-fit: contain` image is the pure, unit-tested `mapContainClick` in `containMap.ts`. Swatches are fully editable in `SwatchStrip`: remove (blocked at 1 swatch remaining; reassigns any role that used the removed hex to the nearest remaining color by luminance, and drops every `blockOverrides` entry holding that hex), add-by-hex, pick-from-image, reset roles (`assignRoles` rerun), reset palette (`extract` rerun on the source blob).

## 13. Data Model

`src/types.ts`:

```ts
type Platform = 'instagram' | 'threads'
type Kind = 'palette' | 'design'
type Role = 'background' | 'surface' | 'text' | 'muted' | 'primary' | 'accent'
type RoleMap = Record<Role, string>   // hex per role, always complete
type MockTemplateId =
  | 'ecommerce' | 'classic' | 'two-column' | 'three-column' | 'sidebar'
  | 'dashboard' | 'blog' | 'portfolio' | 'saas-landing' | 'documentation' | 'components'

interface ImageRef { id: string; order: number; width: number; height: number; mime: string }
// images store record = ImageRef & { entryId: string; blob: Blob; thumb: Blob }

interface Entry {
  id: string; url: string; platform: Platform; author?: string; shortcode: string
  kind: Kind; images: ImageRef[]; sourceImageId?: string
  colors?: string[]; roleMap?: RoleMap; blockOverrides?: Record<string, string>
  mockTemplate?: MockTemplateId; tags: string[]; note: string
  createdAt: number; updatedAt: number
}

interface ExportFileV1 {
  format: 'ui_rover'; version: 1; exportedAt: string
  entries: Array<Omit<Entry, 'images'> & { images: Array<ImageRef & { dataBase64: string }> }>
}
```

**IndexedDB** (`lib/db.ts`, schema v1, database `ui-rover`): store `entries` (keyPath `id`, indexes `by-url` unique / `by-kind` / `by-createdAt`), store `images` (keyPath `id`, index `by-entry`). `openDb()` catches a missing/unusable `indexedDB` and flips an in-memory `Map`-backed fallback implementing the identical API for the session; `StorageBanner` reads `isInMemory()`. `createEntry`/`deleteEntry`/`importEntries`/`replaceAll` each run in one `readwrite` transaction across `entries` + `images` (abort-and-rethrow on any failure, so nothing is ever orphaned); `updateEntry` is a read-modify-write serialized per entry through an in-module promise queue (`updateQueues`) so two debounced writers targeting the same entry can't clobber each other with stale reads.

**Export/import v1** (`lib/export.ts`): export chunks blob→base64 encoding (3 MB read chunks, 32 KB binary-string chunks) to stay within call-stack limits; thumbs are **not** exported (regenerated on import via `makeThumb`). `estimateExportBytes()` sums image bytes before building the JSON; above `EXPORT_WARN_BYTES` (150 MB) the UI warns and lets Mia proceed or cancel. Import: `validateExportFile` checks the complete v1 schema (format/version/every `Entry` field, image records, hex-color fields, `mockTemplate` membership) and rejects the whole file on the first offending path; `prepareImport` decodes every image to a `Blob` and regenerates thumbs in memory before any write. **Merge** (`importMerge`) skips id- or url-colliding entries and inserts the rest in one `importEntries` transaction; **replace** (`importReplace` → `replaceAll`) clears then inserts in one transaction, so old data survives an insert failure.

**Mock spec model** (`features/palette/mock/spec.ts`): `MockTemplate { id, label, frames: FrameSpec[] }`; `FrameSpec { variant: 'web'|'mobile'|'sheet', backgroundRole?, sections: SectionSpec[] }`; `SectionSpec { key, label, columns, blocks: BlockSpec[] }`; `BlockSpec { renderKey, overrideKey, role, shape, span?, label?, height?, width? }`. `renderKey` is unique per frame; `overrideKey` is template-scoped and **shared** between a template's web and mobile frames for the same element (one override reaches both). `code` is a composite shape: its own `role` paints the container (the single touchpoint), its internal line bars cycle a fixed `CODE_LINE_ROLES` mapping read from `roleMap`, not individually overridable. `validateTemplates` enforces: unique `renderKey` per frame, every `overrideKey` prefixed with its own template id and absent from every other template, and every block sharing an `overrideKey` declares the same `role`.

## 14. Data Flow Diagrams

**Save (Capture → entry):**

```mermaid
sequenceDiagram
  participant M as Mia
  participant C as CaptureCard
  participant P as palette/extract
  participant DB as lib/db
  participant R as router
  M->>C: paste URL + screenshot(s), pick kind, Save
  alt kind = palette
    C->>P: extract(sourceBlob)
    P-->>C: ExtractResult | throws
  end
  C->>DB: createEntry(entry, images) — one transaction
  DB-->>C: ok | throws (form state preserved on failure)
  C->>R: navigate(/entry/:id[, {state:{notice}}])
```

**Touchpoint edit (Entry → MockPanel):**

```mermaid
sequenceDiagram
  participant M as Mia
  participant B as Block
  participant TP as TouchpointPopover
  participant MP as MockPanel draft
  participant DP as useDebouncedPatch
  participant DB as lib/db
  M->>B: click / Enter on a block
  B->>TP: open (anchor, block)
  M->>TP: pick swatch or hex, choose role/block mode
  TP->>MP: onApplyRole | onOverrideBlock
  MP->>MP: setDraft (optimistic)
  MP->>DP: queue(patch)
  DP->>DB: updateEntry after 300ms / flush trigger
  DB-->>MP: change emitter fires → entry.updatedAt advances
  MP->>MP: re-seed draft only if clean (§5.8)
```

## 15. Error Handling Strategy

- Invalid/unsupported URL → inline field error (`INVALID_URL_MESSAGE`), no throw.
- URL without an image → Save stays disabled.
- Duplicate URL (`by-url` unique index) → Save disabled + "Already saved — open it" link.
- Clipboard without an image → hint text; typed text pasted into inputs is never treated as an image rejection (`isTextEntryTarget` guard).
- Image limits — >10 images or >12 MB single file → per-file rejection with reason, shown in the tray, dismissible.
- IndexedDB unavailable (private mode, disabled) → in-memory fallback for the session + `StorageBanner`.
- Extraction failure on save → entry saved as `kind: 'design'` + router-state notice (`EXTRACTION_WARNING`).
- Degraded palette (<3 colors) → `SwatchStrip` shows a "palette too small — add colors" notice; not an error.
- Persistence failure on save (`createEntry` throws) → form (URL, images, kind) is preserved, inline save error shown.
- Autosave failure (`useDebouncedPatch`) → patch retained, `error` surfaced, `Retry` button re-flushes.
- Template-select failure → selection reverts + "Couldn't save the template choice — Retry" alert.
- Delete failure → entry and confirm UI stay, inline alert, navigation only on success.
- Import rejection → `validateExportFile` reports the first offending JSON path; nothing is written.
- Import collisions → `importMerge` skips id/url collisions and reports "N imported, M skipped".

## 16. Testing Strategy

Vitest + jsdom + Testing Library + fake-indexeddb; see `docs/4-unit-tests/TESTING.md` for the day-to-day guide. Highlights: `globals: false` (explicit imports, `afterEach(cleanup)`), synthetic pixel buffers instead of PNG fixtures (jsdom has no Canvas), jsdom capability stubs in `src/test/setup.ts` (`createImageBitmap`, object-URL registry, opt-in 2D canvas context via `installCanvas2dStub`), fake-timer tests for the debounce/persistence race conditions in `useDebouncedPatch` and `MockPanel`. Canvas-bound code (`downsample`, `samplePixel`, `imageMeta.makeThumb`) is covered by the manual browser check, not unit tests. No E2E.

Current counts (`npx vitest run`, 2026-09-16): **29 test files, 184 tests, all passing.**

## 17. Performance Considerations

Thumbs (≤320px) are generated at capture time, not at render time. The library grid reads a thumb only once its `EntryCard` has entered the viewport (`IntersectionObserver` via `useThumbUrl`), so a large library never materializes every blob on mount. Object URLs are created and revoked inside the same effect everywhere they're used (`useImageUrl`, `useThumbUrl`, `useImageIntake`) so React 19 StrictMode's double-invoke can't leak one. Palettes are computed once at extraction and stored, not recomputed on render. Edits to note/tags/palette go through `useDebouncedPatch` (300 ms merge) rather than writing on every keystroke.

## 18. Security Considerations

Single-user, local-only. No remote requests. Pasted images never leave the browser. External links (`EntryPage`'s "Open original post") open with `target="_blank" rel="noopener noreferrer"`.

## 19. Deployment

`HashRouter` means `npm run build` → `dist/` deploys to **any** static host (GitHub Pages, S3, a plain file server) with zero rewrite/redirect configuration — deep links like `#/entry/01H…` and reloads both just work, because the router never touches the actual request path. `npm run preview` serves the production build locally. No CI yet.

## 20. Conclusion

Key decisions as built: client-only with screenshot-as-source (no Meta API), IndexedDB (`idb`) + JSON export/import v1 as the only backup path, `HashRouter` for zero-rewrite static hosting, feature folders with `lib/` for pure helpers, Tailwind v4 tokens in CSS, a data-driven wireframe-mock spec (11 templates) with role-level-by-default + per-block-override touchpoints, single-owner persistence per field group with debounced autosave (flush/retry/discard), and synthetic-buffer unit tests around a Canvas-bound pipeline verified manually in the browser.
