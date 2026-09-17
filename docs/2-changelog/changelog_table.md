# Changelog Table

| Version | Week | Commit Message                  |
| ------- | ---- | -------------------------------- |
| `0.2.0` | 1    | feat: read the palette — OCR hex codes, crop tool, swatch-blob fallback, review panel |
| `0.1.0` | 1    | feat: MVP capture, palette wireframe mock with touchpoints, library, IndexedDB + JSON backup |
| `0.0.1` | 1    | chore: initialize TRIP workflow |

# Changelog Summary

- **v0.2.0 (Read the palette - Week 1, 16-09-2026)**:
  - **Feature**: OCR of printed hex codes (bundled Tesseract.js, same-origin), auto-crop from swatch blobs, manual crop tool, swatch-blob fallback, review panel with replace/append; measured 5/5 on the real dopely post
  - **Review**: Codex 3 rounds → APPROVED; Sol release verification + Opus final review recorded in the CR
  - **Files Added**: src/features/palette/read/**, scripts/copy-ocr-assets.mjs, scripts/spike/ocr-spike.mjs, docs/6-memo/ocr-spike.md, docs/2-changelog/w1_v0.2.0.md, docs/3-code-review/CR_w1_v0.2.0.md, docs/5-tuto/tuto_0.2.0.md

- **v0.1.0 (MVP - Week 1, 16-09-2026)**:
  - **Feature**: capture IG/Threads posts by URL + pasted screenshots; palette extraction painted onto an 11-template wireframe mock with per-block touchpoints; design entries with extract-on-design; library with filters, tags, notes; IndexedDB persistence + JSON export/import
  - **Review**: Codex implementation loop 4 rounds → APPROVED; release verification 2 rounds → APPROVED; Opus final review SHIP with observations
  - **Files Added**: src/** (app, components, features/capture, features/palette (+mock/templates), features/library, lib, test), CLAUDE.md, docs/2-changelog/w1_v0.1.0.md, docs/3-code-review/CR_w1_v0.1.0.md, docs/5-tuto/tuto_0.1.0.md

- **v0.0.1 (TRIP Initialization - Week 1, 15-09-2026)**:
  - **Setup**: Initialized TRIP workflow with docs structure and project-local skill copies
  - **Documentation**: Generated ARCHI.md (Web Frontend, client-only SPA; planned sections marked)
  - **Files Added**: docs/ARCHI.md, docs/ARCHI-rules.md, docs/2-changelog/changelog_table.md, docs/4-unit-tests/TESTING.md, .claude/skills/*
