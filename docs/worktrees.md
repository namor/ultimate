## Working in a git worktree

### Standalone preview

Outside an Ultimate-managed workspace, run `git worktree add ../ultimate-preview -b preview`, then `cd ../ultimate-preview`, `pnpm install --frozen-lockfile --prefer-offline`, and `pnpm start --no-open` to run that worktree's code.
Install a separate `node_modules` in each checkout. Share only pnpm's content store. Do not symlink `node_modules` to another checkout: pnpm can rewrite that checkout's dependency metadata, even when you only run a script. Each project path gets its own default state home (a hash of the path), storage and supervisor locks, first free port from 4747, and Vite cache inside its home; explicit home or port overrides must remain distinct. The global `ultimate` command runs the clone it was linked from, so use `pnpm start` inside the worktree instead.

### Managed subagent worktrees

Start a subagent with `isolate: "worktree"` (the worker default) to give its tools a separate checkout; verify its commits, then `land` them or `discard` the checkout while keeping its branch. For Ultimate itself, `instance start` with `subagent: <child id>` previews that child's code on a free port with a separate temporary home; stop the preview afterwards.

### Comparing before and after

To compare a change against its base (a measurement, a test that should fail before), check the base out in a
throwaway detached worktree and run the same thing in both:

```bash
git worktree add --detach /tmp/before <base-sha>
(cd /tmp/before && pnpm install --offline --frozen-lockfile)
# run the same command in /tmp/before and in your checkout
git worktree remove --force /tmp/before
```

Never `git stash`: stashes are shared by every worktree of the clone, and a `stash pop` once applied another branch's
stash.

### Managed workspace integration

Coordinator branches started by @ultimate are isolated in their own worktrees by default: under `<home>/worktrees`, or
where the project's `isolates.worktree.path` says, made by its `add` and `remove` commands when set
(`extensions/workspaces/README.md`). A branch started in a subfolder of the repository works in that subfolder.
`workspace status` shows its tip and the original checkout's tip.
Keep the managed workspace's allocated, registered branch name shown there: submission refuses a checkout on a
different branch. Do not check out a fresh named branch to update the baseline or reconcile target advancement.
The lander handles ordinary target advancement. Do not merge the target into a managed workspace before
`workspace submit`, even when the target has advanced. You can inspect incoming commits without changing your branch.
Any separately authorized reconciliation must preserve history on the allocated branch. If the checkout already differs
from the registered branch, stop and report it for a separately authorized, non-destructive repair. Do not rename the
branch or rewrite the registration yourself.

Read worker reports and diffs; rerun checks only for missing or thin evidence, reported failures, changes crossing
workers, `server/` or `shared/` changes, or surprises in the diff, then land and call `workspace submit`.
The lander is code, not a model. With [personal PR delivery](../extensions/workspaces/README.md#personal-pr-delivery),
it runs the explicit serial checks on an immutable candidate before publishing a branch, reconciles a PR, waits for successful
required GitHub checks and the applicable user approvals (the card, or @ultimate on the user's recorded instruction), then
merges through GitHub before advancing local main.
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
For `server/`, `shared/`, `patches/` or `pnpm-lock.yaml` changes, an authorized `restart` works once the running clone is clean at the landed commit.

### Standing permission to push this repository

Under the repository's existing authority, the top-level agent can commit verified changes and submit them through the lander.
Verify the actual remote repository; do not infer its owner from these docs. Personal PR mode requires explicit user authority for
its destination/publication scope, PR writes and risk gates; the setting does not itself grant that authority. In PR mode publish
only the checked delivery branch, never push remote main directly. Preserve declined project trust. Legacy destination-branch push
permission applies only where separately authorized, whether public or private, not to other repositories. `workspace submit`
uses its frozen personal delivery configuration or the effective legacy settings; never assume a tracked `lander.push` applies.
Subagents commit and report; only the top-level agent submits.

Use normal, non-force pushes only. If the remote advances or rejects a push for a managed workspace, follow
[Managed workspace integration](#managed-workspace-integration). Do not use a standalone checkout to bypass the lander.
Do not push secrets or unrelated unverified work. This standing permission does not authorize releases, publishing,
deployments, or GitHub issue/PR changes.

### Reconciling remote advancement in a standalone worktree

Use this only for separately authorized manual integration outside Ultimate-managed workspaces. If the remote
advances or rejects a non-fast-forward push, fetch the intended ref and inspect the incoming log and diff. Merge in
the standalone worktree without rewriting either history, then rerun checks. Stop and report ambiguous conflicts,
failing checks, security concerns, or any need for a force push or history rewrite. This recipe grants no push or
merge authority.
