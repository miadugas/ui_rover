# ui_rover — Project Instructions

Client-only React 19 + Vite + TypeScript SPA (Tailwind v4, `HashRouter`, IndexedDB via `idb`) — a personal UI/UX swipe file for Instagram/Threads posts. See `docs/ARCHI.md` for full architecture.

## Hard constraint

No Meta/Instagram/Threads API and no scraping, ever. The post URL is only a bookmark key; the pasted/dropped screenshot is the only source of data. Any feature that needs a fetch to Instagram/Threads/Meta is out of scope — propose the screenshot-based alternative instead.

## Gates (run before considering anything done)

```bash
npm run lint            # oxlint
npx tsc -b --noEmit      # typecheck — the -b matters (project references; bare `tsc --noEmit` is vacuous here)
npx vitest run           # full test suite
npm run build            # tsc -b && vite build
```

## Folder conventions

- Feature folders (`src/features/capture`, `src/features/palette`, `src/features/library`) own their components, hooks, and helpers.
- `src/lib/` is for pure, testable helpers and persistence (`db.ts`, `url.ts`, `export.ts`) — no React.
- `src/components/` holds shared UI primitives only (`Button`, `Badge`, `Field`, `Popover`).
- Tests are co-located: `*.test.ts(x)` beside the unit under test. No `__fixtures__/`; palette/image tests use synthetic in-test pixel buffers (jsdom has no Canvas).
- Vitest runs with `globals: false` — import `describe`/`it`/`expect`/`vi` explicitly in every test file.

## Persistence rules

- Every store read/write goes through `src/lib/db.ts` — never touch `idb`/`indexedDB` directly from a component or feature file.
- One persistence owner per field group: palette fields (`colors`/`roleMap`/`blockOverrides`) are written only by `MockPanel`; `tags`/`note` only by `EntryPage`; `mockTemplate` writes immediately (not debounced).
- Never bypass `useDebouncedPatch` for palette, tag, or note edits — it's the one place that handles the 300ms merge, flush-on-blur/unmount/hidden, failed-write retention, and the `discard()` generation counter that stops a stale in-flight write from clobbering a replacement (e.g. re-extraction).

## OCR / read pipeline rules

- `public/ocr/` and `public/ocr-spike/` are generated (by `scripts/copy-ocr-assets.mjs` via `predev`/`prebuild`, and by the one-off spike harness respectively) — never commit either; both are gitignored.
- OCR configuration (engine, PSM, whitelist, crop width, pass geometry in `src/features/palette/read/ocrConfig.ts`) comes from the measurement in `docs/6-memo/ocr-spike.md`. Change those values only with a new measurement against the fixture (or a better one) — never by assumption.
- Tesseract is mocked in tests (`vi.mock('tesseract.js', ...)`, keeping the real `OEM`/`PSM` exports via `importOriginal`). Never let a test hit the real engine or fetch real assets.
- The read pipeline lives in `src/features/palette/read/`, split like the rest of `palette/`: pure detectors (`hexTokens`, `swatchBlobs`, `blobSpace`, `cropRect`) are unit-tested directly; Canvas/worker-bound pieces (`cropToBlob`, `ocrWorker`) are covered by the manual browser check only.

## Styling rules

- Tailwind v4 utilities + `@theme` tokens in `src/index.css` only — no inline hex, no JS-side Tailwind config, no ad hoc CSS files.
- The mock's own chrome (frame silhouette, labels, block skeletons) must always use chrome tokens, never `roleMap`/`blockOverrides` — palette colors are content, not app UI.
- Light + dark both matter from day one (`prefers-color-scheme`); don't ship a component that only looks right in one.

## Workflow

TRIP is the build workflow for this repo: plan in `docs/1-plans/`, architecture of record in `docs/ARCHI.md`, project-local skills in `.claude/skills/` (TRIP + codex copies).

## Git

Git is Mia's — never commit, stage, push, or nudge about git state. This repo currently has no `.git` — don't initialize one unless asked.
