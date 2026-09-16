# Architecture Documentation Rules

[ARCHI.md](ARCHI.md) documents the ui_rover architecture. After each
task (new feature, refactor, bug fix), determine if ARCHI.md needs updating.

## When to Update

Update after ANY change that alters:

- Project structure (new directories, moved files) — §4 Project Structure
- Technology stack (new dependencies, version changes) — §3 Technology Stack
- Components & UI Architecture — §8
- State Management — §9
- Image & Color Pipeline — §12
- Data Model — §13
- Data flow or component interactions — §14 Data Flow Diagrams
- Build or deployment processes — §6 Build System & Toolchain, §19 Deployment

## How to Update by Change Type

### Major Feature / Refactor

Review: §4 Project Structure, §8 Components & UI Architecture, §9 State Management, §12 Image & Color Pipeline, §13 Data Model, §14 Data Flow Diagrams

### Minor Feature / Enhancement

Update: §8 Components & UI Architecture, §13 Data Model, §15 Error Handling Strategy (as affected)

### Bug Fix

Usually no update needed, unless it reveals/fixes an architectural flaw

### Dependency Changes

Update: §3 Technology Stack, and any affected architectural sections

## Guidelines

- Be precise and factual - reflect the actual codebase
- Be concise - enough detail to understand, not implementation specifics
- Update diagrams when data flow changes (§14)
- Reference actual file paths
- Sections tagged **(planned)** must be rewritten as fact in the release that implements them; a release that leaves a now-implemented section tagged (planned) is incomplete.
