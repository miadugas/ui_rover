# Code Review Checklist

This file is the **single source of truth** for code-review criteria. Both human-driven reviews via `.claude/skills/TRIP-review` and Codex-driven reviews via `.claude/skills/codex-code-review` apply the criteria below — referenced, not copied — so the two review surfaces cannot drift.

## Systematic Review Checklist

### 1. Functional Requirements

- [ ] Implementation logic matches requirements correctly
- [ ] Interface/API matches documented specifications
- [ ] Error scenarios handled with proper feedback
- [ ] Edge cases and boundary conditions validated

### 2. Code Quality

- [ ] Proper typing (no unjustified dynamic types)
- [ ] DRY principle - no code duplication
- [ ] KISS principle - not unnecessarily complex
- [ ] Consistent, descriptive naming conventions
- [ ] Complex logic has explanatory comments
- [ ] Files/modules not excessively large
- [ ] Imports/includes organized, unused ones removed

### 3. Architectural Compliance

- [ ] Code follows established patterns from ARCHI.md
- [ ] Proper separation of concerns
- [ ] Appropriate abstractions used
- [ ] Consistent with existing codebase style

### 4. Client-Only & Privacy

- [ ] No network request to Instagram/Threads/Meta or any third party introduced
- [ ] Pasted images stay in the browser (no upload, no data URL leaks into URLs/logs)
- [ ] External links use `rel="noopener noreferrer"`

### 5. Data & Persistence

- [ ] `Entry` type changes are reflected in IndexedDB schema version + migration
- [ ] Export/import round-trip still works with previous JSON shape
- [ ] Blobs stored, not data URLs

### 6. UI & Styling

- [ ] Tailwind v4 utilities / `@theme` tokens, no ad-hoc CSS files
- [ ] Works in light and dark (`prefers-color-scheme`)
- [ ] Keyboard reachable; swatches expose hex as accessible name
- [ ] Empty / loading / error states present

### 7. Image & Color Pipeline

- [ ] Downsampled before quantization
- [ ] Palette computed at capture time, stored, not recomputed on render
- [ ] Extraction failure degrades to a `design` entry with a visible warning

### 8. Error Handling

- [ ] Errors are properly caught and handled
- [ ] Error messages are clear and actionable
- [ ] Failure modes are graceful
- [ ] Logging is appropriate (not too verbose, not silent)

### 9. Security (if applicable)

- [ ] Input validation implemented
- [ ] No sensitive data exposed
- [ ] Authentication/authorization respected
- [ ] No obvious vulnerabilities

### 10. Performance

- [ ] No obvious performance issues
- [ ] Resource cleanup implemented (no leaks)
- [ ] Appropriate data structures used
- [ ] No unnecessary operations in hot paths

---

## Issue Severity Classification

**Critical (Block Deployment)**:

- Security vulnerabilities
- Data corruption risks
- Breaking API/interface changes
- Authentication bypasses

**Major (Require Immediate Fix)**:

- Incorrect business logic
- Significant performance degradation
- Missing error handling
- Compilation/build errors

**Minor (Should Fix)**:

- Code style inconsistencies
- Missing documentation
- Code duplication
- Missing edge case handling

**Suggestions (Nice to Have)**:

- Performance optimizations
- Readability improvements
- Additional test coverage

---

## Review Completion Criteria (Approval Gate)

Minimum for approval:

- [ ] All functional requirements implemented
- [ ] No critical or major issues remaining
- [ ] `npm run lint` clean
- [ ] `npx tsc -b --noEmit` clean
- [ ] `npx vitest run` passes (report as SKIPPED, never as passed, until Vitest is installed)
- [ ] `npm run build` succeeds
- [ ] New logic has test coverage (or a coverage-debt ledger entry per the hard-to-cover policy)
- [ ] Documentation updated per project standards
