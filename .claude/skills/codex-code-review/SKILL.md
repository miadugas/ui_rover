---
name: codex-code-review
description: Iterative Codex CLI code review against an implementation plan
argument-hint: "<plan-path> [extra context] | reset <plan-path> | show <plan-path>"
---

# Codex Code Review

Iterative code review via Codex CLI on uncommitted changes. Codex reads the plan and runs `git status -s` / `git diff HEAD` to inspect the change set.

Review output stays in `state/<key>.review.txt` — not `docs/3-code-review/`. Promotion to `docs/3-code-review/CR_wa_vx.y.z.md` happens after convergence, not per-turn.

State persisted under `~/.claude/skills/codex-code-review/state/<sanitized-target>.{thread,review.txt,events.ndjson}`. Shared scripts live under `~/.claude/skills/codex-plan-review/scripts/`; always export before invoking:

```bash
export STATE_DIR="$HOME/.claude/skills/codex-code-review/state"
```

## Arguments

- `<target>` — auto: start if no thread, resume if exists. Usually a plan path (`docs/1-plans/F_*.plan.md`) or a free-form label for unplanned work.
- `reset <target>` — drop state, next call starts fresh.
- `show <target>` — display latest review without calling Codex.

## Execution

1. **Parse `$ARGUMENTS`**: extract action (`reset`/`show`/auto) and target.

2. **Auto** — try `start.sh` first (exit code 2 = thread exists -> use `resume.sh`):
   - **Start**: `bash ~/.claude/skills/codex-plan-review/scripts/start.sh --prompt-file ~/.claude/skills/codex-code-review/prompts/start.tpl <target> [extra]`
   - **Resume**: `bash ~/.claude/skills/codex-plan-review/scripts/resume.sh --prompt-file ~/.claude/skills/codex-code-review/prompts/resume.tpl <target> [extra]`

3. **Reset**: `bash ~/.claude/skills/codex-plan-review/scripts/reset.sh <target>`

4. **Show**: `bash ~/.claude/skills/codex-plan-review/scripts/show.sh <target>`

5. **Parse trailing tag**:
   - `APPROVED` — propose post-convergence steps.
   - `REQUEST_CHANGES` — surface review verbatim, engage critically (read actual code at `file:line`, fix legitimate ones, push back on incorrect ones), then resume.
   - `NEEDS_REWORK` — surface to user before mass-editing.

6. **Resume** after addressing findings for incremental re-review.

## Diff Visibility

Codex uses `git status -s` / `git diff HEAD` in read-only sandbox. If those fail, pass diff inline: `DIFF="$(git diff --stat HEAD; echo '---'; git diff HEAD)"` as extra context.

## After Convergence

1. Promote `state/<key>.review.txt` to `docs/3-code-review/CR_wa_vx.y.z.md` using `~/.claude/skills/TRIP-review/cr-template.md`.
2. Continue with `TRIP-3-release`.

## Notes

- **Run Codex calls in a background shell.** Invoke `start.sh` / `resume.sh` via the Bash tool with `run_in_background: true` — never as a foreground/inline command. Codex runs at xhigh effort routinely outlast the foreground command timeout; the background task notifies on completion, then read its output. `reset.sh` / `show.sh` are instant and fine in the foreground.
- **Set `CODEX_TIMEOUT=1800`** (30 min) when invoking `start.sh` / `resume.sh` — a generous circuit breaker against hung runs, not a performance target; bump higher for unusually large diffs rather than risk killing a legitimate run. Script default is `0` = no timeout. On expiry the script fails through the normal error path with a "timed out" message in the stderr tail. Requires GNU `timeout`/`gtimeout` (macOS: `brew install coreutils`); warns and runs unbounded if neither is present.
- **Routing.** All model/effort/tier defaults live in one file — `~/.claude/skills/codex-plan-review/scripts/_common.sh`. The lane is derived from `STATE_DIR`:

  | lane | model | role | effort | tier | used by |
  |---|---|---|---|---|---|
  | `implement/routine` | `gpt-5.6-luna` | fast assistant | high | fast | `codex-implement` (default) |
  | `implement/hard` | `gpt-5.6-sol` | senior builder | xhigh | default | `codex-implement`, escalated |
  | `review` | `gpt-5.6-sol` | senior builder | xhigh | default | `codex-plan-review`, `codex-code-review` |

  The rest of the bench is not configured here — see `~/.claude/CLAUDE.md`: **Fable** is the manager (orchestration only), **Opus** the senior reviewer, **Sonnet** the dependable builder. **Codex** as a whole is the *outside* reviewer, which is why it stays advisory and never gating.

  Per-phase routing: TRIP-1 Fable writes the plan, Sol + Opus review it. TRIP-2 Sol takes the hardest work, Opus the ordinary work, Luna the parallel low-risk work. TRIP-3 Sol verifies, Opus does the final review, Fable coordinates release paperwork. Codex is advisory in every phase — so the `implement/routine` Luna lane below only ever receives low-risk parallelizable batches, not "ordinary work".
- **The resolved model is printed for every invocation** — `lane/model/effort/tier` is echoed once before the Codex call starts and once again with the result paths, so a background run identifies its model on its first line of output. Override per run with `CODEX_MODEL` / `CODEX_EFFORT` / `CODEX_TIER`.
- `--sandbox read-only`. Safe to invoke autonomously.
- Thread IDs persisted per-target (no `--last`). Concurrent reviews don't collide.
- Separate `STATE_DIR` from `codex-plan-review` — same key is fine.
- Extra context -> `{{EXTRA_PROMPT}}`. Keep short.
- **`missing field \`base_instructions\`` in the stderr log is benign but fixable.** `ChatGPT.app` bundles its own `codex` (`/Applications/ChatGPT.app/Contents/Resources/codex`, currently 0.148.0-alpha.15) and shares `~/.codex/` with the standalone CLI. When the app refreshes `~/.codex/models_cache.json` it writes the newer schema; an older standalone CLI can't deserialize it, logs that ERROR, refetches the manifest, and continues — the run is unaffected. Permanent fix is to keep the standalone CLI at or above the app's version (`npm i -g @openai/codex@latest`); the stopgap is `rm ~/.codex/models_cache.json`, which the next CLI run rewrites in its own schema until the app overwrites it again.

## Loop Shape

```
turn 1: start.sh -> REQUEST_CHANGES (Critical: A, Major: B C)
         address A B C
turn 2: resume.sh -> REQUEST_CHANGES (A B addressed, Minor: C partial, Suggestion: D)
         address C, optionally D
turn 3: resume.sh -> APPROVED -> promote, continue with TRIP-3-release
```
