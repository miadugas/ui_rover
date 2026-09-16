---
name: TRIP-test
description: Write/run tests following project standards (deep test authoring)
disable-model-invocation: true
argument-hint: "component or feature to test"
---

# Testing Mode

You are now in **testing mode** for **ui_rover**.

This skill is the **deep test-authoring reference**: the `TRIP-2-implement` testing gate points here for heavy authoring work and full guidance. Invoke it standalone for test backfill or coverage work outside an implementation session.

## Prerequisites - Read First

Before testing, you MUST read:

1. @docs/ARCHI.md - Understand system architecture
2. @docs/4-unit-tests/TESTING.md - Testing guidelines

## Your Task

Test: $ARGUMENTS

---

## Testing Guidelines

### Scope

- Only run tests for relevant files that changed (not the whole project)
- Focus on the new feature/fix/refactor

### Commands

```bash
# Run all tests
npx vitest run

# Run specific test
npx vitest run src/lib/url.test.ts

# With coverage
npx vitest run --coverage
```

Vitest + @testing-library/react are planned (ARCHI.md §3) and not yet installed; the first feature plan adds them.

### Test Structure

Co-located: `src/**/*.test.ts(x)` next to the unit under test. Fixture images for palette tests in `src/features/palette/__fixtures__/`. No E2E.

### Testing Priorities

**Unit tests (first)**: URL normalization + platform detection (`lib/url.ts`), color quantization on fixture images (`features/palette`), export/import round-trip (`lib/export.ts`).

**Component tests**: Capture validation states only (bad URL, no image, duplicate).

**What to test**: happy path, each ARCHI.md §15 error case, boundary sizes for images (tiny, huge), dark mode class application.

---

## Hard-to-Test Code

Seam ladder, cheapest first: **exported pure helper → injectable client/adapter → module mock → integration/emulator test**. Take the first rung that works; refactor for a seam only if the refactor is smaller than the feature you're shipping — otherwise it's coverage debt. Before refactoring legacy code, pin it with characterization tests (assert current behavior as-is, then refactor safely).

Uncovered risky paths: one line each in `docs/4-unit-tests/COVERAGE-DEBT.md` (`path | why hard | escape plan`). Delete a ledger line in the same change that gives its path meaningful coverage.

---

## Post-Testing Summary

After completing tests, create a summary file:

**File**: `docs/4-unit-tests/wa_vx.y.z_test.md`
(a = project week, x.y.z = version)

**Content**:

```markdown
# Test Summary - Week a, V. x.y.z

## What Was Tested

[List of tested components/functions]

## Test Results

- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

## Key Findings

[Any issues discovered, edge cases found, etc.]

## Notes

[Additional context or recommendations]
```
