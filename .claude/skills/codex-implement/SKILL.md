---
name: codex-implement
description: Delegate implementation of a TRIP plan (or a scoped part of it) to Codex CLI
argument-hint: "<plan-path> [instructions] | hard <plan-path> | reset <plan-path> | show <plan-path>"
---

# Codex Implement

Non-interactive implementation via Codex CLI in a **workspace-write** sandbox: Codex reads the plan, edits the working tree directly, runs the project's lint/build on its own work, and reports back. One persistent thread per target, so a plan can be delegated in successive batches (or phase by phase) with full context retained.

State persisted under `~/.claude/skills/codex-implement/state/<sanitized-target>.{thread,review.txt,events.ndjson}` (the `.review.txt` file holds Codex's implementation **report** — the naming comes from the shared helpers). `resume`/`reset`/`show` reuse the shared scripts from `codex-plan-review`; always export before invoking them:

```bash
export STATE_DIR="$HOME/.claude/skills/codex-implement/state"
```

## Arguments

- `<target>` — auto: start if no thread, resume if one exists. Usually a plan path (`docs/1-plans/F_*.plan.md`); a free-form label for unplanned work.
- Optional trailing instructions — scope control appended to the prompt, e.g. `"Implement only: <batch checkboxes>"` or `"Now implement: <next batch>"`.
- `hard <target> [instructions]` — same run, escalated to the `implement/hard` lane (Sol).
- `reset <target>` — drop state, next call starts fresh.
- `show <target>` — display the latest report without calling Codex.

## Execution

1. **Parse `$ARGUMENTS`**: extract action (`hard`/`reset`/`show`/auto) and target.

2. **Auto** — try `start.sh` first (exit code 2 = thread exists → use `resume.sh`):
   - **Start**: `bash ~/.claude/skills/codex-implement/scripts/start.sh --prompt-file ~/.claude/skills/codex-implement/prompts/implement.tpl <target> [instructions]`
   - **Resume** (next batch / additional scope): `bash ~/.claude/skills/codex-plan-review/scripts/resume.sh --prompt-file ~/.claude/skills/codex-implement/prompts/continue.tpl [--notes "review corrections"] <target> [instructions]`

3. **Hard lane** (`hard <target>`) — identical commands, one env var prepended. Same skill, same prompts, same thread; only the routing changes:

   ```bash
   CODEX_MODEL=gpt-5.6-sol bash ~/.claude/skills/codex-implement/scripts/start.sh \
     --prompt-file ~/.claude/skills/codex-implement/prompts/implement.tpl <target> [instructions]
   ```

   `CODEX_MODEL` alone is enough: `_common.sh` sees a non-routine model on an implement `STATE_DIR` and moves effort to `xhigh` and tier to `default` with it. Setting `CODEX_EFFORT` / `CODEX_TIER` explicitly still overrides the lane. The escalation is per invocation — the thread is shared, so a plan can run routine batches on Luna and one hard batch on Sol without a reset.

4. **Reset**: `bash ~/.claude/skills/codex-plan-review/scripts/reset.sh <target>`

5. **Show**: `bash ~/.claude/skills/codex-plan-review/scripts/show.sh <target>`

6. **Parse trailing tag** of the report:
   - `IMPLEMENTATION_COMPLETE` — hand control back to the requester's batch review (TRIP-2).
   - `IMPLEMENTATION_PARTIAL` — read the report; resume with instructions for the remainder, or let the requester finish small leftovers directly.

## Notes

- **Run Codex calls in a background shell.** Invoke `start.sh` / `resume.sh` via the Bash tool with `run_in_background: true` — never as a foreground/inline command. Implementation runs are the longest Codex calls in the workflow and will outlast the foreground command timeout; the background task notifies on completion, then read its output. `reset.sh` / `show.sh` are instant and fine in the foreground.
- **Set `CODEX_TIMEOUT=7200`** (2 h) when invoking `start.sh` / `resume.sh` — a circuit breaker against hung runs only, deliberately far above any normal batch; bump higher for unusually large batches rather than risk a mid-run kill. Script default is `0` = no timeout. A timeout here kills Codex while it is editing the tree, leaving a partially modified working state — inspect via `git status` / `git diff` before retrying.
- `--sandbox workspace-write` on start; `codex exec resume` inherits it. Codex edits files and runs repo commands (lint/build); no network, no commits.
- **Fixes are the requester's job.** After Codex reports, the requester (TRIP-2 batch review) fixes problems directly in the tree — do NOT ping-pong fixes back to Codex. Resume only for genuinely new scope (next batch, large remainder), passing what was fixed and why via `--notes`.
- Separate `STATE_DIR` from the review skills — the same plan path can hold an implementation thread and a review thread without collision.
- Codex is instructed not to write tests (testing gate owns that) and not to touch release ceremony.
- Network is blocked in the sandbox: if the plan requires installing a new dependency, Codex will report it as a leftover — install it yourself during the batch review.
- **Routing.** All model/effort/tier defaults live in one file — `~/.claude/skills/codex-plan-review/scripts/_common.sh`. The lane is derived from `STATE_DIR`:

  | lane | model | role | effort | tier | used by |
  |---|---|---|---|---|---|
  | `implement/routine` | `gpt-5.6-luna` | fast assistant | high | fast | `codex-implement` (default) |
  | `implement/hard` | `gpt-5.6-sol` | senior builder | xhigh | default | `codex-implement`, escalated |
  | `review` | `gpt-5.6-sol` | senior builder | xhigh | default | `codex-plan-review`, `codex-code-review` |

  The rest of the bench is not configured here — see `~/.claude/CLAUDE.md`: **Fable** is the manager (orchestration only), **Opus** the senior reviewer, **Sonnet** the dependable builder. **Codex** as a whole is the *outside* reviewer, which is why it stays advisory and never gating.

  Per-phase routing: TRIP-1 Fable writes the plan, Sol + Opus review it. TRIP-2 Sol takes the hardest work, Opus the ordinary work, Luna the parallel low-risk work. TRIP-3 Sol verifies, Opus does the final review, Fable coordinates release paperwork. Codex is advisory in every phase — so the `implement/routine` Luna lane below only ever receives low-risk parallelizable batches, not "ordinary work".
- **The resolved model is printed for every invocation** — `lane/model/effort/tier` is echoed once before the Codex call starts and once again with the result paths, so a background run identifies its model on its first line of output. Override per run with `CODEX_MODEL` / `CODEX_EFFORT` / `CODEX_TIER`.
- **Escalation is per batch, Luna -> Sol.** Luna at high is the default because plan batches are well-scoped and every batch passes through the requester's delta review plus the final full code review. Escalate a single batch to the hard lane (`CODEX_MODEL=gpt-5.6-sol` on that batch's `start.sh`/`resume.sh` call, or the `hard` action above) when it involves any of:
  - **novel core logic** designed from scratch — an algorithm, data structure, protocol, or state machine with no existing pattern in the codebase to follow;
  - **changes the testing gate can't meaningfully verify** — correctness only observable at runtime or by inspection, with no automated check covering it;
  - **concurrency, security, or data-integrity-sensitive code** — where a subtle slip is costly and hard to spot in review;
  - **cross-cutting changes** — one batch touching many files or layers whose interactions must stay coherent.
  When none apply, stay on Luna — a slipped batch is caught and fixed directly in the delta review. For a batch that is merely long rather than hard, `CODEX_EFFORT=xhigh` alone keeps Luna and just buys more reasoning.
- **`missing field \`base_instructions\`` in the stderr log is benign but fixable.** `ChatGPT.app` bundles its own `codex` (`/Applications/ChatGPT.app/Contents/Resources/codex`, currently 0.148.0-alpha.15) and shares `~/.codex/` with the standalone CLI. When the app refreshes `~/.codex/models_cache.json` it writes the newer schema; an older standalone CLI can't deserialize it, logs that ERROR, refetches the manifest, and continues — the run is unaffected. Permanent fix is to keep the standalone CLI at or above the app's version (`npm i -g @openai/codex@latest`); the stopgap is `rm ~/.codex/models_cache.json`, which the next CLI run rewrites in its own schema until the app overwrites it again.
