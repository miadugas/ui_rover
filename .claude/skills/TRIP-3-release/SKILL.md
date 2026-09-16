---
name: TRIP-3-release
description: Release a completed implementation - version, code review promotion, changelogs, docs, commit, tag, ff-merge, push
argument-hint: "plan file or feature label"
---

# Release Mode

You are now in **release mode** for **ui_rover**.

Release: $ARGUMENTS

This skill runs after `TRIP-2-implement` has converged (implementation done, testing gate green, Codex code review `APPROVED` or explicitly skipped). It is normally chained from TRIP-2 in the same session, but can be invoked standalone in a fresh session.

---

## Model Routing — TRIP-3

| Who | Role | Does |
|---|---|---|
| **Sol** | senior builder | Verifies the implementation (Step 0a) |
| **Opus** | senior reviewer | Final review (Step 0b) — the last gate before paperwork |
| **Fable** | manager | Coordinates release paperwork (Steps 1-9) and the git ceremony (Steps 10-13) |
| **Codex** | outside reviewer | Advisory only, never gating |

Sol verifies, Opus reviews: verification asks *did it get built as specified*, review asks *should this ship*. Different questions, so different readers. Neither is Codex's call to make — Sol's verdict informs Opus, it does not replace Opus.

---

## Prerequisites

- Implementation complete and user-confirmed.
- Testing gate green: affected unit tests pass.
- Codex code review converged (`APPROVED`), or explicitly skipped by the user.
- Step 0 complete: Sol verification run, Opus final review passed with no unresolved Critical/Major findings.
- Lint and type-check/build green.

### Standalone verification (fresh session, not chained from TRIP-2)

If this skill was NOT chained from a TRIP-2 session in the current conversation, verify before any release step:

```bash
npm run lint
npx tsc -b --noEmit   # the -b is mandatory; bare `tsc --noEmit` is vacuous in this Vite project-references setup
npx vitest run <pattern-from-the-plan's-Test-Impact-section>   # Vitest is planned, not yet installed — until the plan that adds it lands, report this gate as SKIPPED, never as passed
npm run build          # production build via tsc -b && vite build
```

All must be green. Also verify the Codex state file exists for the given plan path/label (see Step 3 below); if absent, treat as the skipped-Codex fallback (manual CR) and say so explicitly in the CR.

Any failure blocks the release — fix or return to `TRIP-2-implement` first.

---

## Step 0: Verification & Final Review

Runs before any paperwork. TRIP-2's Codex code review converged on the implementation; this pass looks at the release as a whole.

### Step 0a: Sol verifies the implementation

Sol reads the full feature diff against the plan and answers one question: **was what the plan specified actually built?** Not "is it good code" — TRIP-2's review already asked that.

```bash
export STATE_DIR="$HOME/.claude/skills/codex-code-review/state"
CODEX_MODEL=gpt-5.6-sol bash ~/.claude/skills/codex-plan-review/scripts/resume.sh \
    --prompt-file ~/.claude/skills/codex-code-review/prompts/resume.tpl \
    --notes "Release verification pass. Confirm every plan checkbox is genuinely implemented in the diff; flag anything ticked but missing, or built but unplanned." \
    <plan-path> "Release verification for vx.y.z"
```

Specifically flag: checkboxes ticked in the plan with no corresponding diff, behavior in the diff that no checkbox covers, and any plan section (Test Impact, Documentation Impact) the implementation quietly outgrew.

**Advisory.** Sol's findings feed Step 0b. A Sol objection does not by itself block the release.

### Step 0b: Opus final review

The last gate. Opus decides whether this ships.

- Running as **Fable**: delegate to an Opus reviewer, read the findings, and do not proceed to Step 1 until they are resolved. Fable does not clear its own release.
- Running as **Opus** directly: do the pass yourself against the full diff, treating Sol's Step 0a findings as an outside opinion to weigh, not a checklist to tick.

Opus's call covers what the mechanical gates cannot: whether the change is coherent as one release, whether anything shipped that the user did not ask for, and whether the known gaps are ones worth shipping with. Unresolved Critical or Major findings block Step 1.

Record the outcome — it goes into the CR at Step 3 and the changelog at Step 5.

---

## Step 1: Get Current Date/Week

Run this command to get date and project week:

```bash
date '+%d-%m-%Y %H:%M' && python3 -c "from datetime import date; print('Project week:', (date.today() - date.fromisoformat('2026-09-14')).days // 7 + 1)"
```

(Week anchor: the Monday of the week TRIP Init was run. Python is used instead of `date -d` because macOS BSD `date` doesn't support it. If `python3` is not on PATH — e.g. Git Bash on Windows — use `python` instead.)

Use the project week in all subsequent steps.

## Step 2: Version Update

- If not already done in the plan phase, propose new SemVer version (x.y.z)
- Update version in `package.json` (`"version"` field)
- Do not modify anything else in this file

## Step 3: Promote Code Review

Now that week (`a`) and version (`x.y.z`) are known:

1. Compute state file path:
   ```bash
   STATE_KEY="$(realpath <plan-path> | sed 's|^/||; s|/|__|g')"
   STATE_FILE="$HOME/.claude/skills/codex-code-review/state/${STATE_KEY}.review.txt"
   ```

2. Content source:
   - **Multi-round loop**: state file has synthesized review + `PROMOTION_READY`. Strip sentinel.
   - **Turn 1 convergence**: state file has full review already.
   - **Skipped Codex**: write CR from `~/.claude/skills/TRIP-review/cr-template.md` with body "Code review skipped — trivial change." Verdict: `APPROVED with observations`.

3. Replace `<x.y.z>` with actual version. Fill any remaining `<...>` placeholders.

4. Save to `docs/3-code-review/CR_wa_vx.y.z.md`.

5. Verify: no `<...>` placeholders, no `PROMOTION_READY`, version matches version file.

## Step 4: Commit Message

Propose a one-line commit message.

## Step 5: Changelog File

Create `docs/2-changelog/wa_vx.y.z.md` (a=project week, x.y.z=version):

```markdown
# Changelog - Week a, DD-MM-YYYY, V. x.y.z

**Release Date**: Week a, DD-MM-YYYY at HH:MM
**Version**: x.y.z (previously x0.y0.z0)
**Object**: the commit message
**Code review**: `docs/3-code-review/CR_wa_vx.y.z.md` (Codex loop, N rounds -> verdict)
**Release review**: Sol verification [clean / N findings]; Opus final review [passed / passed with observations]

## Changes

[Describe what changed]
```

## Step 6: Changelog Table

Add entry on top of `docs/2-changelog/changelog_table.md`:

```markdown
| `x.y.z` | a | the commit message |
```

Also add a summary entry in the Changelog Summary section.

## Step 7: Architecture Update

1. Read fully @docs/ARCHI-rules.md
2. Update @docs/ARCHI.md following the rules
3. Run `bash ~/.claude/skills/TRIP-compact/count-tokens.sh docs/ARCHI.md` to check token count

**Warning: If ARCHI.md exceeds ~20,000 tokens**, warn the user:

> "ARCHI.md is at ~X tokens. Consider running `TRIP-compact` to reduce it before committing."

## Step 8: Tutorial

Create `docs/5-tuto/tuto_x.y.z.md` explaining the core principle.

**User context for tutorials**:

- Level: Advanced
- Learning focus: inspiration (what other well-built apps do with this same pattern), architecture & patterns, performance & optimization
- Style: Concise — key points, minimal prose, code-first; one "why this shape" paragraph max; end with 2–3 pointers to real-world examples of the pattern

## Step 9: README Update

Update `README.md` with the new version number.
(Content corrections belong to Documentation Sync, next step — do not sync sections here.)

## Step 10: Documentation Sync

Keep the pre-existing (non-TRIP) documentation aligned with the code:

1. Read the plan's **Documentation Impact** section.
2. Contrast it with the **actual diff** of the release (`git diff main...HEAD` or equivalent) — the plan may have fallen short; a doc affected by the real changes must be synced even if the plan didn't list it.
3. Update every affected document. **Factual corrections only**: commands, paths, build targets, script/table entries, cadences, config/env vars, structure trees. It is **forbidden** to touch the voice, tone, or strategic/editorial content of these documents.
4. The updated files are included in the release commit (Step 11) — never a separate commit.

If the plan says "None" and the diff confirms it, skip with a one-line note.

---

After completing all documentation steps, **use the `AskUserQuestion` tool** to ask:

- **Question**: "All documentation steps are complete. Ready to commit?"
- **Options**: "Yes, commit now" (proceed with git commit and tag), "Not yet" (review changes first)

**ONLY after user selects "Yes"**, proceed:

## Step 11: Commit

```bash
git add -A && git commit -m "<commit message from Step 4>"
```

**Important**: Only use the commit message. Do NOT add Co-Authored-By or any other trailer.

## Step 12: Tag

```bash
git tag vx.y.z
```

## Step 13: Merge (fast-forward)

Merge the feature branch back into the main branch, keeping a single clean linear history:

```bash
git checkout main
git merge --ff-only <feature-branch>
git branch -d <feature-branch>
```

If `--ff-only` fails, the main branch moved during implementation — rebase the feature branch onto it, then retry. **Never create a merge commit.**

## Step 14: Push

**Use the `AskUserQuestion` tool** to ask:

- **Question**: "Release vx.y.z is committed, tagged, and merged. Push to remote?"
- **Options**: "Yes, push now" (push branch and tags), "Not yet" (push manually later)

**If "Yes"**:

```bash
git push && git push --tags
```
