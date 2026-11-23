# Workspaces

An isolated conversation gets its own Git checkout. Coordinator branches started by @ultimate are isolated by
default. Subagents can select `isolate: "worktree"` for the same setup. Uncommitted source changes are not included.

Isolation needs a Git repository with a checked-out branch and a first commit. Until a project has them, `isolation`
returns `{ reason }`, an isolated start fails with that reason, and the project has no lander.
@ultimate handles Git setup through onboarding before starting isolated work. `isolation` also reports whether the
folder is `empty`; once the project can be isolated, it stands the lander if there is none, so a first commit brings it
without a restart. `setupGit` makes an empty folder isolatable (`git init` where needed, then an empty first commit) and
refuses a folder with files, whose first commit is a judgement for an agent; onboarding's Git card offers both.

Each conversation has one record in the root `ultimate.workspaces` document.
Its path is `<home>/worktrees/<conversationId>`; its branch includes the home hash and conversation ID.
Where checkouts live and how they are made can be configured in the project's settings, for repositories whose
tooling owns worktrees: company-internal monorepo tooling that must create and register each tree, a Git setup that
refuses worktrees outside one folder, or a team that keeps every tree in one place. All three keys are optional:

```json
{
  "isolates": {
    "worktree": {
      "path": "~/trees/{name}",
      "add": "./scripts/tree-add {path}",
      "remove": "./scripts/tree-remove {path}"
    }
  }
}
```

- `path` is where each checkout goes. `{name}` is `ult-<hash>-<conversationId>` (the lander's is `ult-lander-<hash>`),
  and a leading `~/` is expanded; the template must contain `{name}` and the result must be absolute. Without it, checkouts go under `<home>/worktrees` and
  `<home>/lander`. Checkouts outside `<home>/worktrees` are not counted in the workspace disk stats.
- `add` creates the checkout instead of `git worktree add`. It runs with `sh` in the source checkout, with `{name}`
  and `{path}` filled in as single shell words, and must leave a worktree of the source registered at `{path}`;
  Ultimate then runs `git checkout` there (the conversation's branch, or a detached tip for the lander). When it
  fails, or a crash interrupts it, Ultimate clears its half-made checkout and runs it again on the next attempt, so
  it must be safe to repeat.
- `remove` removes it instead of `git worktree remove`. Ultimate runs it only on a checkout without modified or
  untracked files, as Git would, and it must leave `{path}` unregistered.

The commands get five minutes each. A conversation started in a subfolder of its repository opens in the same
subfolder of its checkout.
Preparation runs setup commands with `ULTIMATE_SOURCE` set to the source checkout. By default these are the gated
project settings' `isolates.worktree.setup`. To configure only setup personally, even when project setup is declined,
put a per-project map in **`~/.ultimate/settings.json` only**:

```json
{
  "worktreeSetup": {
    "/projects/my-app": ["pnpm install --frozen-lockfile"]
  }
}
```

The key is the canonical absolute main-checkout path, shared by its linked and nested worktrees. An explicit entry
replaces the entire command list; `[]` disables execution. Only an absent entry uses the existing gated project
settings. There is no global command fallback, and other projects are unchanged. Settings are read afresh for
preparation, merged-revision lander setup and setup health. Health reports configured command counts, not whether an
install succeeded. This personal map does not enable any project resources or override worktree `path`, `add`,
`remove`, lander checks/push, models or extensions.
Setup commands run sequentially in the new checkout, with a two-minute timeout each, and must be safe to repeat after interruption.
What a project's setup should do (dependencies, `.env`, a copy-on-write SQLite clone, a dev port per worktree, skipping
the database in the lander's checkout, and when to ask about Postgres) is the "Worktree setup" step of the
`integrate-ultimate` skill; setup health warns while an isolatable project with a package manifest has none.
The first model request waits for preparation. Before every tool call, the workspace must be ready with a
present, registered checkout. Otherwise the tool is blocked with the reason; the model can still reply and
explain why it cannot use the checkout.
A removed workspace is recreated at the same path on the next model request, or by the next tool call when it was
released mid-run. A leftover folder there that holds only files the source ignores (a dev server's `.vite/` cache) is
cleared first; any other folder is refused. An existing branch with unlanded
commits is checked out unchanged, with its tip as the new base; a merged or missing branch starts at the current
target tip. Nested isolates prepare their source ancestor checkouts first.
The existing `workspace_workflow` prompt section starts and waits for the same durable preparation task used
on creation; setup commands run again before the model can use tools.
Failed setup keeps its output tail and never force-removes dirty output. The conversation's next tool call retries it (checkout and setup again), so fixing the cause, such as a PATH without `pnpm`, takes effect in the same conversation; until it succeeds every tool call is blocked with the setup's error.

Info's Workspace section (`Workspaces` in `ui.solid.tsx`) shows the lander queue, the shown conversation's checkout and
statistics over every checkout, read-only: landing goes through agents. Concluding a conversation can release its clean, landed checkout.
`isolation` says why the project cannot be isolated, if it cannot; `info {id}` reads the record and current tips; `create {cwd?, title?}` returns a new conversation ID.
`github` returns `https://github.com/<owner>/<repo>` of the project's `origin`, or null off GitHub; landing cards and
the root row link commit ranges with it. `repo` returns the same repository as `{key, name, url, visibility?}` for the
sidebar's project header: `name` and `visibility` come from one `gh repo view` per process (`readGithubRepo`,
`lib/project-identity.ts`), and without `gh`, signed out or offline it is the key's `owner/repo` without a visibility.
The service's `land(id)` fast-forwards a worker's source (its owner's checkout) to the worker's clean tip, for
`subagent land`; it refuses moved or diverged targets and never rebases or pushes. The only way to the project's
target branch is `workspace submit`.
`progress {ids}` (at most 100) reports `{id, uncommitted, unlanded}` for every ready worktree among `ids`, without
their subagents, for the sidebar's in-flight rows.
`pending {ids}` reports `{id, uncommitted, unlanded}` for checkouts with uncommitted changes or commits not on the
target, including transitively owned subagents, for the warning before concluding. The `workspaces` service exposes
`pending(ids, ctx)` and `release(ids, ctx)`; release removes every checkout that holds nothing only its folder
holds: no uncommitted changes and no commits on HEAD that neither its branch nor the target has (detached work).
Commits on its branch stay with the branch in the source, and the next input recreates the checkout on it. Release
deletes merged branches and returns checkouts kept for that work or `busy` reasons (running or queued input). Descendants release before ancestors; a kept descendant also keeps its
ancestors, reported with `descendant: <id>`. The removal transaction also checks current records sourced transitively
from the checkout, so a descendant resumed during the batch keeps its source ancestors. Nested recreation checks
its source parent's `ready` state and folder in the transaction that starts preparation; otherwise it readies the
parent and retries. Source queues are acquired ancestor-first for that decision and filesystem recovery.
Git writes are serialized per source and removal is never forced.
Release atomically checks run admission and marks the record `removed` before deleting the folder. Requests wait
on that same source queue before checking the record and recreating. Reconciliation and recreation finish
interrupted removals; newly found work at risk is kept and the checkout returns to `ready`. Refused removals report `reason` and
restore `ready` only if the folder remains a registered worktree. If removal succeeded before branch cleanup
failed, the record stays `removed` with the error so the next input can recreate it. Recovery through `ready()`
returns the kept record and retains the reason in workspace info.
On open, a background reconciliation releases concluded conversations' eligible checkouts, then `sweep` removes
checkouts in `<home>/worktrees` that no record knows (an earlier chapter made them; its records stayed with it) when
they are clean registered worktrees without detached work, deleting their merged branches; the others stay and are
named in a notice. Failures become notices.
`release(ids, ctx, signal?)` stops between checkouts when aborted. Closing aborts reconciliation and waits only
for the current checkout to finish, not the remaining batch.
`discard {id}` explicitly removes a clean checkout and keeps its branch until reuse (the `subagent` tool's
`discard` covers worktree children). All removed checkouts follow the same recreation rule above, preserving
unlanded branch history, including after explicit discard.
`stats` counts checkouts by state, ready ones by commits (landed on the target, ahead, none yet) and uncommitted
changes; `disk` measures the worktrees directory with `du`, and on btrfs also the real size with shared blocks counted
once (`btrfs filesystem du`). Measuring takes seconds, so one runs at a time and its result is reused for a minute.

## Personal PR delivery

A user can opt one project into PR-first delivery without trusting its project resources. In **personal** `~/.ultimate/settings.json` only:

```json
{
  "delivery": {
    "/projects/my-app": {
      "repository": "example/my-app",
      "remote": "origin",
      "base": "main",
      "checks": ["pnpm verify"],
      "requiredChecks": ["verify"]
    }
  }
}
```

The canonical main-checkout key is shared by managed worktrees. An entry replaces delivery configuration as a unit;
`false` disables remote delivery for that project, an absent entry keeps legacy gated lander settings, and invalid entries
fail closed. Activation needs separate user authority for that repository's publication, PR changes and merge policy.
It does not enable project agents, extensions, skills or settings. Previews ignore the personal opt-in and never publish.
The resolved configuration is frozen on submission, so a later settings change cannot retarget unfinished work.

In this mode `workspace submit` also takes `risk` (`low`, `medium`, `high`) and `review` (independent reviewer and immutable
range, with no blocking findings). Risk assessment and review judgment belong to the coordinator, not a code classifier.
The lander prepares the candidate and runs every explicit local check serially. A flaky rerun does not qualify for publication.
Here `pnpm verify` performs frozen installs, format/lint/types/dependency checks, root fast/e2e tests and the tracked project-extension
suites, using a temporary HOME and an environment allowlist. It starts no real native Cursor work or external model requests.
This is evidence for the checked tree, installed locked dependencies and runtime, not a hermetic guarantee about every machine.
If integration changes the reviewed tree, publication waits for independent review of the reported candidate; resubmit the same
workspace tip with `reviewedTree`, `risk` and `review`. No main-branch merge in the workspace is needed.

Only then does delivery push the immutable SHA to its submission branch and create/reconcile a PR in the explicit repository.
The queue record holds the candidate, tree, destination, check time, write intents and PR identity across replacement tasks.
The named Git remote must have exactly one effective push destination, the authorized GitHub repository. The lander
reads branch SHAs and compares commits in that repository on GitHub, not on a local fetch mirror. It reconciles an
interrupted push against the exact delivery ref. An uncertain PR creation/merge is reconciled before further writes;
missing or conflicting evidence stops delivery rather than blindly repeating a create. Blocked records stay visible for
**Recheck outcome**. Rechecking does not fabricate a new local-check timestamp or clear an uncertain-write intent.
A delivery can be stopped at any stage short of `merged` while retaining its record; the lander then closes its own PR with a
comment, and the delivery branch stays. Uncertain writes must be reconciled first.

### The queue: one state table

One `workspaces.lander` task per source checkout runs the queue. Its `next` phase takes the first entry the lander can move
now (`pick` in `delivery.ts`); an entry that waits on a person never holds the slot and never expires. One PR is in flight per
repository: a second verified candidate parks at `publish` until the first merges, so a merge never stales a sibling PR. When
nothing is ready but something waits on GitHub, the task sleeps until the earliest poll (30 s); when everything waits on a
person, it ends, and the action that clears the wait (an approval, a recheck, a resubmission) starts it again. `waits(d)`
(`delivery.ts`) is the single source of truth for "who clears it"; the card, the sidebar, the questions pill and `authorize`
all read it.

| stage                         | waits on                                   | holds the slot | who moves it                                                                | bounded by                                               |
| ----------------------------- | ------------------------------------------ | -------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| queued, verifying             | the lander                                 | yes            | lander                                                                      | check watchdog                                           |
| `review`                      | independent review of the integration tree | no             | the branch resubmits with `reviewedTree`                                    | none                                                     |
| `publish` (high risk)         | publish approval                           | no             | user, @ultimate on instruction or standing approval                         | none                                                     |
| `publish` (sibling in flight) | the repository's in-flight PR              | no             | lander, once that PR merges or parks                                        | none                                                     |
| `pr`, `ci`                    | GitHub                                     | no             | lander, every 30 s                                                          | a required check idle for 60 min is rerun, at most twice |
| `merge` (medium/high)         | merge approval                             | no             | user, @ultimate on instruction or standing approval                         | none                                                     |
| `merge` (low or approved)     | GitHub                                     | no             | lander: head-sha merge after a fresh base check                             | none                                                     |
| `merged`                      | the lander                                 | yes            | lander: fast-forwards the local target                                      | none                                                     |
| `blocked`, branch             | the submitting branch                      | no             | branch or @ultimate: recheck (3 per candidate), stop, resubmit (supersedes) | 3 wakes per branch chain, then @ultimate                 |
| `blocked`, user               | the user                                   | no             | user, or @ultimate on instruction: recheck or stop                          | none                                                     |
| `blocked`, `stale`            | the lander                                 | yes (briefly)  | lander: closes its PR, rebuilds the same submission on the current base     | 3 rebuilds, then @ultimate                               |

**Mechanical decisions are the lander's code.** Every block carries a structured `cause` (`check-failed`, `infra`, `closed`,
`runtime`, `github`, `uncertain-write`, `auth`, `safety`, `stale`); nothing matches reason text. A required check that
concluded `failure` blocks to the branch. One that concluded otherwise (`cancelled`, `timed_out`, `startup_failure`) or never
ran within an hour is an infrastructure failure: the lander cancels a stuck run and reruns the completed one through the Actions API, at
most `MAX_RERUNS` (2) times per candidate, then blocks to the branch with cause `infra`. Before a new push or merge, the
lander reads the base ref. If it has advanced from the verified baseline, the lander rebuilds without spending CI on an
unpublished candidate. A rewritten base, unconfirmed push, or HTTP 405/409 alone does not authorize a rebuild. For a
proven advance, the lander queues its own PR for closing with a comment if it exists and deletes the delivery record
(keeping spent approvals on the entry so an instruction cannot decide a second delivery),
bumps `rebuilds` and verifies the same tip again on the current base with fresh memos and a `-r<n>` delivery branch; after
`MAX_REBUILDS` (3) it asks @ultimate. A resubmission of the same branch to the same target supersedes its parked predecessor in
the submit transaction (`supersedes`: parked, not landing, no uncertain write): the old entry becomes a `failed` result
"Superseded by <id>", its PR goes on `closing`, and no Stop click is needed (PR #33, 2026-11-20). A stop or supersede closes
the PR on the lander's next turn: `closePull` reads the PR first and leaves a merged or already closed one alone; a failed close
is retried three times then dropped with a notice. Each autonomous decision is appended to `delivery.decisions` (at most 20)
and the card lists them.

`test/queue-replay.test.ts` replays the past incidents (the 2026-11-09 starved CI fix, a runner never acquired,
slow-runner timeouts, an outside merge, a moved base, two green PRs, the 2026-11-20 PR #33 resubmission, a two-hour
approval wait) against this scheduler and against the previous serial slot with its one-hour expiry, asserts on every
tick that a parked entry never delays a ready one, and writes the old-versus-new numbers to
[`test/queue-replay.md`](test/queue-replay.md).

**Who decides what needs judgment.** No new agent: a real failure wakes the owning branch (its coordinator knows the change),
which rechecks, stops or resubmits; @ultimate approves publish and merge under the user's standing approval; the user decides
only medium/high approvals without a grant, credentials, safety holds and uncertain remote writes, each with one card carrying
the PR link. `watcher`, `scout` and `worker` were considered and rejected: a watcher adds a model-written script to poll what
the lander already polls durably, a scout cannot act, and a worker lacks the branch's context.

**Blocked deliveries are the branch's to repair.** Each block is reported once (`delivery.wake`, numbered by `blocks`, with a
per-block request id). A block the branch can repair (a failed check, a timeout, a closed PR) wakes the submitting branch with
the reason, the candidate and the PR's checks page; a concluded branch is resumed by that input. The branch, or @ultimate,
then calls `delivery` with `recheck` or `stop` itself, without an instruction: recorded as `by: 'agent'` with its conversation,
and a stop reads "Stopped by conversation #id". Agents get at most three rechecks per candidate; after that the user's click
(or @ultimate on their instruction) can still recheck, and stop is always allowed. A repaired candidate is a fresh `workspace
submit`, with its own review and approvals. A branch is woken for at most three blocks across its resubmissions (reset when it
lands); a later block, or one that needs the user (an uncertain remote write, a GitHub login or credential, a publish or merge
approval, a safety hold such as a branch collision or an outside merge), wakes no model: it goes to @ultimate's conversation as
a card to ask the user, and to the branch as a note, and agents cannot recheck it. Agents never publish or merge this way;
those stay with the user as below.

Automatic merge requires strict required-check protection including administrators, no force/deletion bypass, a PR requirement
(with zero mandatory platform approvals allowed for a solo maintainer), and genuine successful named GitHub Actions checks on the
candidate. Empty, missing, skipped, neutral, cancelled and timed-out checks are not success. The current base must descend from the
recorded baseline and be contained in the checked candidate. An ordinary head-SHA-guarded merge preserves its tested tree; local main
advances only after GitHub confirms that merge and its tree. Publication, CI and merge are distinct stages on the submit card.

Low-risk work is eligible for automatic merge only after independent review. Medium/high risk requires the user's candidate-bound
**Approve merge**; high risk also requires scope agreement before sensitive implementation and **Approve publication**. New
candidate content invalidates the prior evidence/approvals. Chat scope agreement is separate from GitHub's platform review
requirements and cannot satisfy a required second GitHub approver.

**Who may approve.** Apart from an agent's recheck or stop of a blocked delivery (above), the `delivery` action (`publish`,
`merge`, `recheck`, `stop`) takes the user's own click on the card, or a
codemode call from @ultimate, the root standing agent, when the user told it to in its chat. @ultimate passes `instruction`: the
entry id of the user's input in its conversation that gave the order. The action checks that a `user.input` event from a browser
(`device` set) names that entry: only the user's composer and answer card emit one, so a `pi.user` input the server placed, an
answer @ultimate settled in the user's name, a dismissal, or a request the voice model forwarded does not count. The entry must
come after the submission (a reassessment resets that point, and one that lands mid-call refuses the approval), and must not
have decided another delivery. Any other conversation (a branch, a subagent, a side chat, an automation run) is refused, as is
@ultimate while a hands-off goal is open: the goal decides in the user's place elsewhere, never here. Every action is recorded on
the delivery (`approvals`: who, when, and for @ultimate its conversation and instruction entry), and the card shows it with a link
to the instruction. The candidate, tree, stage, uncertain-write and GitHub-check protections apply to both callers alike: the
user waived the click, nothing else. The browser path trusts any same-origin request as the user's click, as it did before.

**Standing approval (temporary).** The `standing` action lets the user hand @ultimate a time-boxed standing approval to get
work out the door. @ultimate grants it with `{ instruction, hours? }`: `instruction` is the user's typed entry that told it to,
checked like a per-delivery instruction (browser-stamped `user.input`), and it must be the user's latest input in @ultimate's
conversation, at most ten minutes old, newer than the previous grant and its revocation, and not one that already decided a
delivery; `hours` defaults to 24 and may be at most a week. The grant is stored on the root workspaces index (`standing`:
instruction, conversation, granted and expiry time). The user revokes it with the card's **Revoke** button (or tells @ultimate,
which calls `{ revoke: true }`); revoking also withdraws standing approvals no write has used yet (a recorded merge intent is
reconciled, never withdrawn). An expired or revoked grant is kept as its record and refuses like none. The server checks that a
review covering the exact tree was submitted, not how independent it was: @ultimate judges that before approving. While it is on, the
delivery card shows "Standing approval until <time>", and @ultimate may call `delivery` with `standing: true` and a `reason`
instead of `instruction`, for `publish` and `merge` only. `authorize` (`delivery.ts`) decides every delivery action inside the
approval's commit, for every actor (the user's click, @ultimate on an instruction or under the grant, the branch or @ultimate on
their own): the grant must be on and unexpired, the delivery verified on this runtime, past the `review` stage (the independent
review covers the exact tree), at the requested stage (`merge` is reached only when the exact head's required GitHub checks
passed, and they are re-read right before merging), and free of uncertain writes; agents may only recheck or stop a parked
delivery. The approval records `standing` (the grant's instruction entry) and
`reason`, and the card shows it. When a delivery pauses for an approval that qualifies, the lander wakes @ultimate with a
follow-up input naming it. Branches, subagents, side chats, automations, browser calls and hands-off goals cannot grant or use it.

**Destination limitation:** GitHub's immediate merge API compares the head SHA, not the base ref. Before activating automatic merge,
the user must explicitly accept that nobody retargets a delivery PR during its immediate validation/merge window. Fresh destination
reads and strict checks remain, but this operational assumption is not an atomic enforced guarantee. No deferred native auto-merge
or administrator bypass is used. See [GitHub's merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request).

Delivery uses the lander's durable sleeps, not model polling; a wait on a person has no deadline. Stage changes and blocked
outcomes are reported, without waking a model for each poll. Existing check/landing events remain available for bounded
feedback automations; adding a delivery setting does not activate unrelated standing automations.

### Follow one delivery attempt

To keep its own approved landing open across failed attempts, the coordinator can opt in atomically with `workspace submit` and `outcome`. To wait on an exact prerequisite instead, call `workspace follow` with `outcome` (the delivery it still owes) and `after` (an exact submission ID in the same source checkout). Only that workspace can register the wait. A missing ID is not a reason to wait for a branch that never submitted. A retained result returns `needs-action` immediately. A still-queued attempt wakes its owner when it ends, including on failure, stop or replacement. Intermediate checks and parked approvals are not terminal. There is no automatic enrollment or background polling.

Inspect `workspace status` before acting. Its `continuation` names the obligation and its current key. Diagnose the result. If the supposed prerequisite is unnecessary, do not wait for it to land. While enrolled, `workspace submit` requires `continueFrom` set to that key. It links the next normal attempt; an obsolete key cannot submit in its place. To change the wait, pass its current key to `follow`. An own failed attempt stays open and uses the lander's normal failure report. A linked successful landing closes the workspace delivery, not a deployment. `workspace unfollow` with the current key stops tracking only; it does not stop a delivery or declare the work finished.

A wake is not permission to retry, publish, merge or start a full suite. If the recovery turn ends without a linked next step or active work, its starter can receive one request to reconcile it. Use an acknowledged handoff for conditions outside the lander. No person is asked automatically.

### Pull request text

The coordinator supplies `pullRequest: { title, body }` with `workspace submit`. Name the behavior change in the title
(up to 72 characters). In the Markdown body, explain why it matters. Give concrete evidence, material gaps, the blast radius
and the limits of a rollback or restart. Keep it as short as the change allows. A small fix need not have sections.

The lander appends a receipt for the verified candidate: local check count and runtime, review status, submitted risk,
CI requirement, and candidate, tree and base SHAs. It makes no model call. Without explicit public copy it uses only a
short candidate title and the receipt. It never builds public prose from the conversation summary, private review,
configured commands or divergence. The submitter must remove private data from public copy: redaction can catch
common forms, not arbitrary secrets. After an integration changes the reviewed tree, supply fresh copy on review
resubmission. The lander never rewrites an existing PR description.

## Lander

The lander is the only way to a project's target branch, and it is code: no model runs in it. Each submission and its
landing result appear in the submitting conversation as tool and outcome cards. The `@lander` conversation keeps the
full log in `ultimate.lander` entries and refuses every input. Before its first submission, it shows
`No landings yet` instead of a model conversation's welcome. Its read-only footer names the source checkout and
explains why each source has its own log.

`workspace submit` requires a non-empty `divergence` string: how the delivered result differs from the original
request (new agreements, different approach or library, changed scope), or "None" when it matches. It queues a
top-level main's clean tip in the root document's `queue` and returns its position and lander conversation at once;
the main keeps working. The submission saves `divergence` and `at`, the submitter's latest visible entry at submit
time, as a breadcrumb. One `workspaces.lander` task per source checkout (`landers`) processes that source's entries
in order.

The task runs in that source's lander conversation (`landerConversations`): ownerless, titled "@lander",
labelled `lander`, its cwd the lander checkout. The project's checkout has one from the moment the extension opens
(idempotently, the same record submit uses); another source gets its own on its first submit. It has no workspace and
is no main, so `workspace submit` refuses it. The task is its conversation's foreground work, so the Agents
tab shows it working while it lands. The sidebar pins every lander
conversation above the others, never concluded, with "idle · last <sha> <time>" or a pulsing "landing". It logs
every submission as `ultimate.lander` entries, which carry no model message, so no model run in that conversation
sees them: `queued`, `started`, each step, each check with `passed`, `failed` or `flaky`, and the outcome (`landed`
with `sha`, `commits`, `paths`, `flaky`, `pushed`, or `failed` with `reason` and the `output` tail). Each line is
committed with the task state change or doc update it describes; a check result is logged right after the check
runs, so a crash before its memo logs the rerun too. The same commits record each step as `{ step, at, check? }` in
the queue entry's `steps`; when the submission ends, its steps, outcome, tip and target move into the root document's
`results` (the latest 50).

The submitter follows the lander in its own transcript, from that document. The `workspace submit` card shows
`submit · <tip> → <target>` and a status chip (`queued #2`, the current step with a spinner, `Landed <sha> · pushed`,
`Not landed`); below it an "N steps" toggle, open while queued or landing and closed once finished, lists the step
rows and ends in a quiet "full log in #<lander>" link. The lander's report message renders as an outcome card with
a success, warning (landed, push failed) or error accent and the same collapsed steps. Nobody has to open the lander
conversation; it keeps the full log, grouped by submission, and shows in the Agents tab.
The commit that records a landed outcome (also when only its push failed) emits the durable event
`workspaces.landed` (`SubmissionLanded` in `api.ts`): submission, submitter and its `at`, `sha`, `base`, `target`,
lander, divergence, the submit-time title, summary and feature, the first ten commits with `commitCount`, the first
eight paths and `pushed`. A failed outcome emits `workspaces.landing-failed` (`SubmissionFailed`): submission,
submitter, target and `reason`; it `fails` `workspaces.landed`, so a browser `until` on a landing ends with it. Each check run, a rerun included, emits `workspaces.check`
(`CheckRan`): submission, command, `passed`, `failed`, `flaky` or `timeout` (a watchdog stopped it) and its `ms`, in the
commit that logs its result. Lineage reacts to it with a landing note in the submitter's tree
root, exactly once, unless the submitter is that root or has none; the lander itself calls no lineage service. Its
data includes `divergence` and `at` alongside `from`, `sha`, `target`,
`commits` and `paths`; model text cites `#<from>/<at>` and always includes `Diverged: …`, even for "None". The
submit-time summary stays in the data and on the card but not in the model text: it is often stale, and the tally's
abstract of the submitter tells its story. In a tally, the note freezes that abstract: it carries it as `abstract`
with a `State at landing` block in its text, and the card shows it collapsed (see the lineage README).
The shared landing card in the root and submitter shows a quiet Diverged line and the breadcrumb.
Failed submissions leave no root note; notes never wake the root.

What lands is named once, at submit: the queue entry keeps the submitter's `subject` (title, summary and feature)
from the `conversations` service's `subject(id)`, so a later retitle does not rename it. The result, the lander log's
first lines and outcome, and the root note carry that snapshot. `landing.tsx` renders it the same everywhere: the
`LandingCard` (feature tag, title, summary, then the outcome) is the lander log's outcome, the submitter's report and
the root's landing note; its one-line `Subject` heads each submission in the lander log and the submit card, and the
lander's sidebar row shows the feature it lands or landed last.

1. Resets its own detached checkout, `<home>/lander/<hash of source>`, to the target branch tip.
   With `lander.push`, it fetches the remote branch and merges it when it is ahead.
2. Merges the submitted tip. A conflict aborts the merge and reports the conflicting paths to the submitter.
   Runs the same resolved setup commands on the merged revision before checks.
3. Runs `lander.checks` in order. Each check is stopped after 2 minutes without output or 10 minutes total, or at
   its own `timeout` (seconds, which also caps the no-output limit), killing its whole process group. Watchdog
   failures name the limit that fired, the failed test lines seen so far (vitest's `FAIL`/`×` lines, kept even when
   they scrolled out of the tail) and the output tail, and rerun like other check failures.
   An entry is a check or an array of checks, a group that runs concurrently; a check is a command string or
   `{ "command": "pnpm test", "timeout": 180 }`.
   A failing check
   reruns once: passing then is reported as flaky, failing again reports the output tail to the submitter once every
   command of its group settled. Each command keeps its own memo, steps and flaky note; the note names what failed on the
   first run (`pnpm test · exit 1: test/a.test.ts > its name`, or `Out of memory: exit 137`). A passed or flaky check records its last
   output line (ANSI stripped, at most 200 characters) as `summary`, shown muted after the command on its step row.
   A failed run's log entry keeps its output tail as `output` (not in `steps`), under a collapsed "Output" in the
   lander's log, so a check that then passed as flaky can still be diagnosed.
4. Fast-forwards the target branch in the source checkout (`merge --ff-only` when it is checked out). If the target
   moved meanwhile it starts again, at most three attempts.
5. With `lander.push`, pushes the target branch (never forced); a rejection integrates again once, then is reported.
6. Records `landed`, emitting `workspaces.landed` in the same commit, then reports (request id `lander:<submission>`
   for each write): the landed commit and commits, flaky checks, whether it pushed, "Needs restart." for `server/`,
   `shared/`, `patches/` or `pnpm-lock.yaml` changes to the running clone (`needsRestart` in `lib/layers.ts`), and the lander conversation id for the full log.
   - A failure is a waking input to the submitter (a `workspaces.lander-report` entry): it fixes the cause in its
     workspace and submits again.
   - A landing is the end of the branch's work. The report is a note in the submitter, which starts no run. In one
     commit the submitter is concluded unless work is still under way: messages' `underway` (a run or queued input, a
     busy subagent, a reply-enabled message of its own still open, a pending notify or subagent report), through the
     `workspaces.branches` extension point messages provides. Then the conversation that started the branch
     (`starter`, from the same extension point) wakes with the same card, its text cut to one line (branch, sha,
     pushed, `needs restart`, flaky checks) plus the divergence, saying whether the branch is concluded or
     still has work under way (which then reports when it stops, as any branch does). Last, a concluded branch's
     checkout is released. A root or standing agent refuses concluding and stays open. Any later input resumes a
     concluded branch.

Settings (`.ultimate/settings.json`): `"lander": { "checks": ["pnpm check", [{ "command": "pnpm test", "timeout": 180 }, "pnpm test:e2e"]], "push": "origin" }`;
both are optional. Anything that must follow every landing (a deploy, a notification) is an automation on the
`workspaces.landed` event.

Each attempt starts from a reset checkout, and the integrated commit is memoized after the checks, so a crash resumes
safely. Failed submissions are dropped from the queue after their report.

The fast-forward records `landed: { sha, base, commits, paths, flaky }` on the queue entry in the same commit as the
workspace's `landed`. A lander task that ends after that and before its report, for example one faulted because a
reload of this extension changed the Workspaces document, loses its memos but not that record: whichever task picks
the entry next skips merging and checks, pushes exactly `landed.sha` when the target still contains it, and reports
the original landing. "Nothing new to land" means the tip was already in the target before this submission.

The extension restarts a lander for every source whose queue holds submissions while its task is missing or ended:
when the harness opens, on each reload of the extension, and at once when a task of the previous code faults. A fault
of the current code's own task waits for the next submit or open, so a deterministic fault does not loop.

Top-level mains use `workspace status` and `workspace submit` for their own checkout.
Landing reports commits and changed paths, with a restart hint for core or package changes to the running clone.
Landing never restarts Ultimate.
