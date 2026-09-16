---
name: codex-plan-review
description: Iterative Codex CLI review of a planning document
argument-hint: "<plan-path> [extra context] | reset <plan-path> | show <plan-path>"
---

# Codex Plan Review

Iterative review of a planning document via Codex CLI. State (thread ID, review text, event log) persisted under `~/.claude/skills/codex-plan-review/state/<sanitized-path>.{thread,review.txt,events.ndjson}`.

The companion `codex-code-review` skill shares the same scripts with its own prompt templates and `STATE_DIR`.

## Arguments

- `<plan-path>` — auto: start if no thread, resume if exists. Trailing free-text is extra context.
- `reset <plan-path>` — drop state, next call starts fresh.
- `show <plan-path>` — display latest review without calling Codex.

## Execution

1. **Parse `$ARGUMENTS`**: extract action (`reset`/`show`/auto) and plan path.

2. **Auto** — try `start.sh` first (exit code 2 = thread exists -> use `resume.sh`):
   - **Start**: `bash ~/.claude/skills/codex-plan-review/scripts/start.sh --prompt-file ~/.claude/skills/codex-plan-review/prompts/start.tpl <plan-path> [extra]`
   - **Resume**: `bash ~/.claude/skills/codex-plan-review/scripts/resume.sh --prompt-file ~/.claude/skills/codex-plan-review/prompts/resume.tpl <plan-path> [extra]`

3. **Reset**: `bash ~/.claude/skills/codex-plan-review/scripts/reset.sh <plan-path>`

4. **Show**: `bash ~/.claude/skills/codex-plan-review/scripts/show.sh <plan-path>`

5. **Parse trailing tag**:
   - `APPROVED` — tell user, done.
   - `REQUEST_CHANGES` — engage critically: fix legitimate findings by editing the plan, push back on incorrect ones. Surface review verbatim, propose fixes, let user confirm.
   - `NEEDS_REWORK` — surface to user before mass-editing.

## Notes

- **Run Codex calls in a background shell.** Invoke `start.sh` / `resume.sh` via the Bash tool with `run_in_background: true` — never as a foreground/inline command. Codex runs at xhigh effort routinely outlast the foreground command timeout; the background task notifies on completion, then read its output. `reset.sh` / `show.sh` are instant and fine in the foreground.
- **Set `CODEX_TIMEOUT=1800`** (30 min) when invoking `start.sh` / `resume.sh` — a generous circuit breaker against hung runs, not a performance target; bump higher for unusually large targets rather than risk killing a legitimate run. Script default is `0` = no timeout. On expiry the script fails through the normal error path with a "timed out" message in the stderr tail. Requires GNU `timeout`/`gtimeout` (macOS: `brew install coreutils`); warns and runs unbounded if neither is present.
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
- On network failure, check `*.events.ndjson.stderr`. Run `reset.sh` and retry.
- Thread IDs persisted per-plan (no `--last`). Concurrent reviews don't collide.
- Extra context -> `{{EXTRA_PROMPT}}`. Keep short.
- **`missing field \`base_instructions\`` in the stderr log is benign but fixable.** `ChatGPT.app` bundles its own `codex` (`/Applications/ChatGPT.app/Contents/Resources/codex`, currently 0.148.0-alpha.15) and shares `~/.codex/` with the standalone CLI. When the app refreshes `~/.codex/models_cache.json` it writes the newer schema; an older standalone CLI can't deserialize it, logs that ERROR, refetches the manifest, and continues — the run is unaffected. Permanent fix is to keep the standalone CLI at or above the app's version (`npm i -g @openai/codex@latest`); the stopgap is `rm ~/.codex/models_cache.json`, which the next CLI run rewrites in its own schema until the app overwrites it again.

## Loop Shape

```
turn 1: start.sh -> REQUEST_CHANGES (A B C)
         address A B C
turn 2: resume.sh -> REQUEST_CHANGES (A B addressed, C stale, new D)
         address C D
turn 3: resume.sh -> APPROVED
```
