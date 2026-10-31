Run an independent Cursor coding agent in a dedicated git worktree, with progress, cancellation and saved results for review.

## Installation

Keep this folder at `.ultimate/extensions/cursor-task/` for a trusted project's extension, or copy the folder to `~/.ultimate/extensions/cursor-task/` for personal use. Project installation requires the project's normal trust decision; no broader trust is needed. This is an extension, not an Ultimate built-in.

Use Node26 and the official `cursor-agent` CLI, already installed and logged in. No extension package or SDK/API-key installation is needed. The extension does not install the CLI, authenticate automatically or rewrite agent settings.

The `cursor_task` tool takes a coding `task`. It starts from the calling conversation's committed `HEAD`, in a fresh detached worktree. Uncommitted source changes are not copied. One task can run at a time.

## Independent, not a Pi model

Cursor owns its native coding, shell tools and internal loop. It is not a selectable Pi provider, a Pi conversation or a reconstructed Pi history. Each call starts a fresh Cursor session using `grok-4.6[effort=xhigh,fast=false]` (Grok 4.6 Extra High, non-fast). Both parameters are explicit rather than relying on a legacy alias's catalogue defaults; Cursor's model settings remain in the job's isolated configuration directory. Before sending the task, the runner requires ACP to advertise model `grok-4.6`, effort `xhigh` and fast `false`; missing or different values fail without a prompt. Resume/follow-up, images and cross-job history are not exposed.

**Cursor runs with normal user access. A worktree is not an OS security sandbox.** Task instructions and normal allow-once permission decisions assign work to that working copy; they do not isolate the machine from arbitrary code. The CLI may use its normal personal context. Unsupported client execution, requested outside-worktree permission targets, new authentication and recognized destructive host commands are rejected, but native shell execution is not a general security boundary.

The extension never reads or exports credentials, starts a browser login, confirms a Keychain prompt, changes billing settings, or uses a force/allow-all CLI flag. Settings, CLI data and compile cache are redirected to the job directory. Missing existing authentication is a failure, not an invitation to log in automatically.

## Cursor todo metadata

[Cursor's official ACP contract](https://cursor.com/docs/cli/acp) defines `cursor/update_todos` with `toolCallId: string`, `merge: boolean` and `todos: { id: string; content: string; status: "pending" | "in_progress" | "completed" | "cancelled" }[]`. It describes notifications (no response) and also specifies `CursorUpdateTodosResponse`. For the observed addressed form, including request id `0`, this client returns the documented nested result `{ outcome: { outcome: "accepted", todos } }`. A no-id notification receives no reply.

This acknowledges Cursor-owned metadata only. Extra fields are discarded; no todo contents are logged, saved or copied into Pi's plan, and no local todo list is mirrored (`merge` remains Cursor-owned). Limits are 100 todos, 256 characters per identifier, 4096 per content string and 64 KiB of combined todo id/content bytes. Invalid metadata receives the documented rejected outcome with a fixed reason and stops the job. Other addressed client methods remain denied; no filesystem, terminal, authentication or generic `cursor/*` capability is enabled.

## Progress and permission scope

[ACP v1 tool locations](https://agentclientprotocol.com/protocol/v1/tool-calls) are follow-along display metadata, not file-access grants. Progress hints never open files or cancel a job merely for pointing outside the assigned worktree. Actual permission requests still reject outside or unresolved targets. Partial v1 updates retain prior context when fields are omitted or null; explicit current permission details replace it.

A shared classifier distinguishes lexical and physical containment (including symlink parents and `..`). URI, tilde, control-character, empty, oversized and non-string supplied targets are denied rather than expanded or treated as local filenames. Missing optional location/input metadata is not itself a malformed supplied target. Broken links remain unresolved and cannot authorize a permission.

`job.json` saves at most eight deduplicated `locationDiagnostics`, plus a dropped count. They contain only fixed phase/field/kind/status/permission labels, input-form and root categories, and lexical/canonical containment booleans. A rejected target retains a diagnostic even after the cap. No reported path, basename, username, title, command, params or raw frame is logged; repository-relative path logging is deliberately omitted. Canonicalization inspects filesystem metadata only, never file contents. This is diagnostic and permission policy, not OS isolation or proof of filesystem effects; it does not mutate Pi's plan.

## Unverified process cleanup

A failed cleanup saves `processEvidence` in `job.json`: the known root identity, last complete observed ownership set and timestamp before the tracking gap, latest retained remaining-identity snapshot, total observed count, direct-child reaped state and first fixed failure category/phase/time. Identities contain only PID, parent PID, process group and validated birth time—never commands, environment, usernames, raw rows or OS error text. Sampling and cleanup failures remain distinct.

Each stored identity set is limited to 4096 entries. Overflow fails closed and preserves the earlier complete set; runtime ownership is never truncated, so cleanup still considers every known identity. A later healthy inventory—even an empty remaining set—does not clear sticky tracking failure or certify cleanup. These records support checking known birth-matched ownership, not arbitrary PID/PGID/cwd guesses or universal daemonization coverage. They cannot backfill older jobs whose ownership was never saved. Inventory deadlines and signal/membership checks are unchanged; malformed rows or unusable birth times are fatal.

## Review the working copy

The card shows native activity, status, paths and a result preview. The job directory keeps saved state and, once created, these artifacts:

- `job.json`: saved state and paths;
- `result.md`: bounded complete output, or explicitly partial output after interruption/failure;
- `changes.patch`: the actual tracked and unignored new-file changes;
- `worktree/`: the working copy, retained for inspection once preparation succeeds.

Jobs live under `<Ultimate state home>/cursor-task/<job id>/`. Nothing is automatically committed, merged, landed or pushed. The Pi parent must inspect the changes, run the relevant tests and decide how to integrate them. Ignored build/dependency output remains in the retained worktree, not the git patch.

Use **Cancel** to stop a task and await owned-process cleanup. Interruptions and host/owner loss retain partial artifacts; ambiguous work is never resent automatically. **Refresh result** reloads the saved outcome after an interrupted tool call. Remove a retained worktree with normal git worktree management only after its changes have been reviewed or deliberately discarded.

## Delegation

Optional routing example for `ultimate` and `coordinator` agent overlays: keep the project's chosen model/family settings and adopt this only when native Cursor delegation is wanted. Installing the extension does not require this policy or change agent models:

> Use GPT-6.1 Sol for orchestration, planning, decisions and work you perform yourself. Use GPT-6 Luna for routine monitoring and summaries. Route every eligible bounded non-review coding/execution delegation through `cursor_task` (Cursor Grok 4.6 Extra High, fast=false), not Pi worker/designer subagents. Eligible means a self-contained native job from committed HEAD that fits the 10-minute limit and needs no Pi-only tools or ongoing child conversation. Serialize Cursor jobs across the host; if busy or failed, stop and report rather than silently fall back to Sol/Luna. Do read-only reconnaissance yourself; do not substitute a write-capable Cursor job for a scout. Review/test retained changes and handle commits/integration yourself.
>
> Ultimate/coordinators and Pi lifecycle roles (watchers, landers and dream passes) keep their existing Pi models. Use one final GPT-6 Astra reviewer per change; supporting review agents use Sol/Luna, never parallel Astra reviewers. Outside Cursor execution and that final reviewer, Sol 6.1 remains the maximum. Grok 4.7 orchestration is deferred.

## Limits

- One active job, with a 10 minute deadline.
- Text and patch bounds fail explicitly, rather than returning a clipped success.
- External usage/cost is unknown when ACP does not provide it; it is not reported as zero.
- Process tracking covers observed descendants, including separate process groups. It is not a kernel sandbox/subreaper and cannot guarantee capture of an unobserved daemon that escapes before discovery.
- Local cancellation/exit is not proof that remote inference or billing has stopped.
- Native CLI verification was limited to macOS/Node26; other platforms are unverified. No cross-platform compatibility layer is included.

## Focused checks

```sh
node --test .ultimate/extensions/cursor-task/test/e2e/runner.test.ts
./node_modules/.bin/vp test --config .ultimate/extensions/cursor-task/test/vite.config.ts
./node_modules/.bin/vp check
node scripts/deps.ts
```

The core tests use a fake ACP process, not the user's Cursor account. They do not establish live Cursor availability or remote billing termination. Live verification is separate and requires explicit authorization; these checks never silently launch a billable task.
