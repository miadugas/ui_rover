# ui_rover

**Version 0.1.0**

A personal UI/UX swipe file for Instagram and Threads posts. It turns saved posts into a browsable library of two entry kinds: **palette** entries (a post showing a color palette, extracted and previewed on a UI mock) and **design** entries (a post showing a UI/UX design, kept with tags and notes for later reference).

## How it works

There is no Meta/Instagram/Threads API and no scraping. The post URL is the bookmark key; the screenshot you paste or drop is the data. Everything runs in the browser — palette extraction happens on Canvas, entries persist in IndexedDB — and the only backup path is JSON export/import.

## Capture flow

1. Paste the post URL.
2. Paste or drop one or more screenshots (carousels welcome).
3. Pick **palette** or **design**.
4. Save.
5. On the entry page: swatches, a wireframe mock (11 templates) where every block is a touchpoint to recolor, and tags/notes.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run oxlint |
| `npx tsc -b --noEmit` | Typecheck gate — the `-b` matters here (project references; bare `tsc --noEmit` is vacuous) |
| `npm test` / `npm run test:watch` | Run tests once / in watch mode |

## Backup

Export produces `ui_rover-YYYY-MM-DD.json` with images inline (base64). Import either merges new entries by URL or replaces the whole library — replace requires confirming twice.

## Project layout

```
src/app/                    routes (landing, library, entry)
src/features/capture/       URL + image intake, save flow
src/features/palette/       extraction, role/override model
src/features/palette/mock/  wireframe mock renderer
src/features/palette/mock/templates/  11 layout specs
src/features/library/       grid, filters, export/import
src/lib/                    db, url parsing, export (pure helpers)
src/components/             shared UI
docs/                        TRIP workflow: ARCHI.md, 1-plans/, changelog
```

## Docs

See [`docs/ARCHI.md`](docs/ARCHI.md) for architecture and design principles.
