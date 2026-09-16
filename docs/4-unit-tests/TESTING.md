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

## What Is Manual-Only

Per the TRIP-2 gate rule, a manual browser pass is required for anything Canvas-bound or requiring a real image pipeline: paste a real IG URL + screenshot and confirm it saves/reloads/repaints; repeat for Threads; try a non-image paste; pick-from-image on one portrait and one landscape screenshot, sampling a known solid area and confirming the hex; switch every mock template, reload, and confirm the selection and its overrides survive. Export download (Blob URL + anchor click) — verify in the browser; unit tests cover the panel's flow with `downloadExport` mocked. No E2E suite exists or is planned for v1.

## Current Counts

Last recorded via `npx vitest run` (2026-09-16): **29 test files, 184 tests, all passing.** Re-run the command above to refresh this before relying on it for a release decision.
