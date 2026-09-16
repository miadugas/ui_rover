---
name: TRIP-1-plan
description: Plan a new feature following project standards
argument-hint: "describe the feature you want to build"
---

# Planning Mode

You are now in **planning mode** for **ui_rover**.

## Prerequisites - Read First

Before creating any plan, you MUST read ALL THE LINES of:

1. @docs/ARCHI.md - Understand current system architecture

## Your Task

Plan the following feature: $ARGUMENTS

---

## Model Routing — TRIP-1

| Who | Role | Does |
|---|---|---|
| **Fable** | manager | Writes the plan (Steps 1-2) |
| **Sol** | senior builder | Reviews the plan — via the Codex bridge (Step 3a) |
| **Opus** | senior reviewer | Reviews the plan — Claude-native (Step 3b) |
| **Codex** | outside reviewer | Advisory only, never gating |

Two reviewers is deliberate. Sol reads the plan as the builder who would have to execute it; Opus reads it as the reviewer who has to live with it. Codex — Sol included — is an **outside** opinion: it informs Step 4, it never decides it. The only gate in this skill is the user's answer in Step 4.

---

## Step 1: Discovery & Clarification (Interactive)

**Do NOT start writing a plan immediately.** First, engage in a discovery conversation to fully understand the user's intent.

### 1.1 Initial Understanding

After reading the feature request, summarize your understanding in 2-3 sentences, then **use the `AskUserQuestion` tool** to present clarifying questions with structured options.

Frame questions around:

- **Scope**: What's included vs excluded?
- **Behavior**: How should it work from the user's perspective?
- **Constraints**: Any technical limitations, deadlines, or dependencies?
- **Priority**: What's most important if trade-offs are needed?

For each question, provide 2-4 concrete options based on your analysis of the codebase and the feature request. Always let the user provide custom input via the built-in "Other" option.

After the user answers, proceed **directly to writing the plan** (Step 2) — no approach-confirmation question. Ask a follow-up round with `AskUserQuestion` only if a blocking ambiguity remains (**maximum 3 rounds total**; if still unclear, summarize what you know and proceed with noted assumptions).

---

## Step 2: Plan Document Creation

Once understanding is confirmed, create the plan document.

### File Naming

Depending on the feature (major, minor, patch), propose a new version using SemVer (x.y.z) and create:
`docs/1-plans/F_[version]_[feature-name].plan.md`

### Required Sections

```markdown
# [Feature Name] Implementation Plan

## Overview

[2-4 sentences describing the feature and its purpose]

## Problem Statement (if applicable)

[Current limitations/issues this feature addresses]

## Solution Architecture

[High-level design approach]

## Implementation Details

### 1. [Component/Module/File Name]

**File**: `path/to/file`

[Detailed description of changes needed]

**Current state** (if modifying existing):
[Describe what currently exists]

**Modifications**:

- Specific change 1 (around line X)
- Specific change 2 (around line Y)

### 2. [Next Component/Module/File]

[Continue with same pattern]

## Technical Considerations

- **Pattern Usage**: feature folders (capture / palette / library), `lib/` for pure helpers, `components/` for shared primitives — per ARCHI.md §4
- **Client-only constraint**: no fetch to Instagram/Threads/Meta, no backend, no tokens (ARCHI.md §5.1) — a plan that needs one is out of scope
- **Data model**: changes to `Entry` / IndexedDB stores need an export/import round-trip story (ARCHI.md §13)
- **Image pipeline**: downsample before quantize; store Blobs not data URLs; main thread until proven slow (ARCHI.md §12, §17)
- **Styling**: Tailwind v4 utilities + `@theme` tokens in `src/index.css`; light + dark from day one; neutral chrome so saved palettes read true
- **Accessibility**: keyboard reachable capture flow, focus management on paste/drop, ARIA on swatches (hex as accessible name)
- **Edge cases**: unsupported URL, clipboard without image, duplicate URL, IndexedDB unavailable (private mode), extraction failure → fallback to `design`
- **Performance**: lazy-load library grid images; palettes computed once at capture, never on render

## Files to Modify/Create

[Comprehensive numbered list with purposes]

1. `path/to/file1` (modify) - Purpose description
2. `path/to/file2` (new) - Purpose description

## Type Definitions (if applicable)

[New types, interfaces, structs, or modifications to existing ones]

## Performance & Cost Impact (if applicable)

[Expected performance implications]

## Backward Compatibility (if applicable)

[Migration strategy if needed]

## Test Impact

[2-5 bullets: which existing tests the change affects, what new logic will need tests, whether an integration/E2E check applies. No test code — the TRIP-2 testing gate consumes this section.]

## Documentation Impact

[Mandatory. List every document OUTSIDE the TRIP docs that this feature will leave outdated, with one line each on what becomes stale. If none are affected, write "None". The TRIP-3 Documentation Sync step consumes this section before the release commit. Always evaluate the candidates below.]

- `README.md` — still the Vite template; the first feature plan must replace it. After that: quick start, command list, capture-flow description
- `CLAUDE.md` (project, once created) — gate commands, folder conventions
- `docs/ARCHI.md` — any "(planned)" section that becomes fact must be rewritten as fact (see docs/ARCHI-rules.md)

## To-dos

### Phase 1: [Phase Name] (if multiple phases are needed) or simply skip title if only one phase is needed

- [ ] Task description
- [ ] Another task

### Phase 2: [Phase Name] (if applicable)

- [ ] Task description
- [ ] Another task

**Note**: For simple plans, a single phase is sufficient. Split into multiple phases only for complex features requiring sequential implementation.

**Note**: Do NOT write test code during planning — the Test Impact section above only names what the TRIP-2 testing gate will run and author.
```

## Quality Standards

- **Zero Ambiguity**: Every step must be clear and actionable
- **File-Level Specificity**: List exact files and functions to modify
- **Architecture Alignment**: Must conform to existing patterns in ARCHI.md
- **Risk Assessment**: Highlight potential failure points

---

## Step 3: Codex Second-Opinion Review

Before the user sees the plan, run the Codex plan review loop. **Always run it — no confirmation question.** The user gets exactly one decision point in this skill, and it comes after the plan is reviewed (Step 4).

### Loop

1. **Start**: `bash ~/.claude/skills/codex-plan-review/scripts/start.sh --prompt-file ~/.claude/skills/codex-plan-review/prompts/start.tpl <plan-path>`
2. **Parse trailing tag**: `APPROVED` -> Step 4. `NEEDS_REWORK` -> surface to user. `REQUEST_CHANGES` -> continue.
3. **Address findings critically** — quote each P1/P2, push back on incorrect ones, fix legitimate ones by editing the plan in place.
4. **Write implementer notes** (1-3 sentences): which findings you fixed, which you pushed back on and why, any user decisions that override existing docs or environment limitations that can't be resolved in the plan.
5. **Resume** with notes:
   ```bash
   bash ~/.claude/skills/codex-plan-review/scripts/resume.sh \
       --prompt-file ~/.claude/skills/codex-plan-review/prompts/resume.tpl \
       --notes "Fixed X. Pushed back on Y because Z. User decided W." \
       <plan-path>
   ```
   -> back to step 2.
6. **No cap** — keep iterating until Codex returns `APPROVED`.

Surface Codex reviews verbatim. Keep edits scoped to findings. Reset thread (`reset.sh <plan-path>`) only if context is genuinely confused.

This is **Step 3a — Sol's advisory review**. Its `APPROVED` is not an approval to proceed; it clears the way to Step 3b.

---

## Step 3b: Opus Plan Review (Claude-native)

Sol reviewed the plan from outside. Opus reviews it from inside, with the session's full context — the discovery answers, the codebase reads, the user's stated constraints. Codex never sees those.

**Who runs it:**

- Running as **Fable** (manager): delegate the review to an Opus reviewer and read the returned findings before continuing. Fable does not review its own plan.
- Running as **Opus** directly: do the review pass yourself, as a distinct step with fresh eyes — re-read the written plan against ARCHI.md and the discovery answers, rather than recalling what you meant to write.

**What Opus checks that Sol structurally cannot:**

- The plan matches what the user actually asked for in Step 1 — scope neither widened nor quietly narrowed.
- Assumptions the plan silently inherited from the discovery conversation are written down in it.
- Architecture alignment against the *read* ARCHI.md, not the summarized one.
- The Test Impact and Documentation Impact sections are real, not placeholders — TRIP-2 and TRIP-3 consume them directly.

Fix what Opus finds by editing the plan in place. If a finding contradicts Sol, say so explicitly in Step 4's summary and give your reasoning — do not silently pick one.

---

## Step 4: User Review

After the Codex review converges, present a summary:

- **Feature**: [name]
- **Approach**: [1-2 sentences]
- **Files affected**: [count] files ([list key ones])
- **Estimated complexity**: [simple/moderate/complex]
- **Sol (Codex) status**: [APPROVED after N rounds / NEEDS_REWORK surfaced to you]
- **Opus review**: [clean / N findings fixed / any Sol-vs-Opus disagreement and how you called it]

Then **one `AskUserQuestion`** — the single decision point of this skill:

- **Question**: "Review the plan at `docs/1-plans/F_x.y.z_feature-name.plan.md`. How to proceed?"
- **Options**:
  - "Approved — implement now" → continue straight into `TRIP-2-implement` with this plan
  - "Approved — stop here" → plan saved, no implementation
  - "Rework" → the user provides feedback as text

Handle the answer:

- **Rework**: update the plan from the user's feedback, then re-present. Run another Codex pass if the changes are substantive.
- **Other (custom input)**: handle accordingly.

Approval and the implement-now decision are one question on purpose — approving a plan and choosing when to build it is a single thought, and splitting it into two prompts buys nothing.

---

## IMPORTANT: No Code Implementation

**DO NOT write code snippets or implement anything during planning.**

This is a high-level planning phase only. Your plan should describe:

- WHAT needs to be done (features, changes, structures)
- WHERE changes will happen (files, modules, functions)
- WHY certain approaches are chosen (trade-offs, rationale)

But NOT:

- Actual code implementations
- Detailed algorithm code

Keep it architectural and descriptive. Code comes in the `TRIP-2-implement` phase.

## For New Capture Sources / URL Formats
Required analysis: URL shapes to accept (regex + fixtures), normalization rule (what makes two URLs "the same"), platform badge, duplicate detection behavior, unit tests in `lib/url.test.ts`.

## For Palette / Mock Changes
Required analysis: input (which stored image, size cap), algorithm change and why (quantization, dedupe threshold, sort), which mocks consume which color roles, fixture images for tests, light/dark check of the mock.

## For Library / Data Model Changes
Required analysis: `Entry` type diff, IndexedDB store/index changes + migration (version bump in `lib/db.ts`), export/import compatibility with existing JSON backups, filter/search impact, empty + loading states.
