## Working in a git worktree

Run `git worktree add ../ultimate-preview -b preview`, then `cd ../ultimate-preview`, `pnpm install`, and `pnpm start --no-open` to run that worktree's code. Each project path gets its own default state home (a hash of the path), storage and supervisor locks, first free port from 4747, and Vite cache inside its home; explicit home or port overrides must remain distinct. The global `ultimate` command runs the clone it was linked from, so use `pnpm start` inside the worktree instead.

Start a subagent with `isolate: "worktree"` (the worker default) to give its tools a separate checkout; verify its commits, then `land` them or `discard` the checkout while keeping its branch. For Ultimate itself, `instance start` with `subagent: <child id>` previews that child's code on a free port with a separate temporary home; stop the preview afterwards.

### Main-agent final integration

Coordinator branches started by @ultimate are isolated in their own worktrees by default: under `<home>/worktrees`, or
where the project's `isolates.worktree.path` says, made by its `add` and `remove` commands when set
(`extensions/workspaces/README.md`). A branch started in a subfolder of the repository works in that subfolder.
`workspace status` shows its tip and the original checkout's tip.
Keep the managed workspace's allocated, registered branch name shown there: submission refuses a checkout on a
different branch. Do not check out a fresh named branch to update the baseline or reconcile target advancement.
Leave ordinary target advancement to the lander; any separately authorized reconciliation must preserve history
within the allocated branch. If the checkout already differs from the registered branch, stop and report it for a
separately authorized, non-destructive repair, rather than renaming branches or rewriting the registration yourself.
This constraint applies to managed workspaces, not the manual worktree recipe above, and grants no new merge authority.

Read worker reports and diffs; rerun checks only for missing or thin evidence, reported failures, changes crossing
workers, `server/` or `shared/` changes, or surprises in the diff, then land and call `workspace submit`.
The lander is code, not a model. With [personal PR delivery](../extensions/workspaces/README.md#personal-pr-delivery),
it runs the explicit serial checks on an immutable candidate before publishing a branch, reconciles a PR, waits for successful
required GitHub checks and the applicable user-only approvals, then merges through GitHub before advancing local main.
Here `pnpm verify` covers frozen installs, lint/types and all identified suites with a clean environment.
Without that opt-in, the legacy path runs only its effective `lander.checks`, retries a failing check once, then fast-forwards
locally and optionally pushes to `lander.push`. Tracked project settings do not apply when project trust is declined;
an empty effective check list permits a local landing, so that outcome alone proves no verification. Keep working while it runs.
A conflict or a check that failed twice comes back to the submitter as a waking report: fix it in the workspace (a
flaky test at its cause, or delete it) and submit again. A landing is the end of the branch's work: its report is a
note in the branch, the branch is concluded unless work is still under way (a subagent, a reply it waits for, queued
input), whoever started it wakes with the landing card, and the concluded branch's checkout is freed.
Its progress shows live on the submit tool card, with expandable steps, and its report as an outcome card; the
source's @lander conversation, pinned in the sidebar's agents group, keeps the full log and takes no input.
For `server/` or `shared/` changes, an authorized `restart` works once the running clone is clean at the landed commit.

### Standing permission to push this repository

Under the repository's existing authority, the top-level agent can commit verified changes and submit them through the lander.
Verify the actual remote repository; do not infer its owner from these docs. Personal PR mode requires explicit user authority for
its destination/publication scope, PR writes and risk gates; the setting does not itself grant that authority. In PR mode publish
only the checked delivery branch, never push remote main directly. Preserve declined project trust. Legacy destination-branch push
permission applies only where separately authorized, whether public or private, not to other repositories. `workspace submit`
uses its frozen personal delivery configuration or the effective legacy settings; never assume a tracked `lander.push` applies.
Subagents commit and report; only the top-level agent submits.

Use normal, non-force pushes only. Remote advancement or a non-fast-forward rejection is normal: fetch, inspect the
incoming log and diff, and merge non-destructively in an isolated workspace, preserving both histories. Rerun checks,
then submit through the configured path without bypassing its gates. Stop and report ambiguous conflicts,
failing checks, security concerns, or a situation requiring a force push or history rewrite—not ordinary remote
advancement. Do not push secrets or unrelated unverified work.
This standing permission does not authorize releases, publishing, deployments, or GitHub issue/PR changes.
