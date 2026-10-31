---
name: design-checkpoint
description: >-
  Adaptive design-to-implementation checkpoint: independent intent and critic
  readers, evidenced resolution, outcome-driven rechecks, and a fresh readiness
  reader on exact worker briefs. Use for a feature assessment that needs
  independent critique before implementation. Skip for a small known fix.
---

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`. Sources: five selected
`skills/egm-*` recipes. Modified for Ultimate; not EGM-certified. See
[UPSTREAM.md](UPSTREAM.md) and [LICENSE](LICENSE).

# Design checkpoint

One coordinator holds author context and decides. Readers never implement.
Existing `subagent`, watchdog, plan, messages/questions, goals and root memory
carry the work. This skill adds a recipe and artifacts, not a dispatcher, UI,
settings change or second authority ledger.

**Skip** a small known fix: 0 readers, no design ritual. **Stop** an unauthorized
scope expansion before buying a review swarm. An assessment that stops at
concept feasibility uses I+C and says **readiness pending**, not ready to
implement. Previously reviewed unchanged packet/briefs may be reused with
explicit provenance; do not relaunch to hit a quota.

Templates (relative to this skill): [design](references/design-template.md),
[review record](references/review-record.md),
[handoff](references/handoff-template.md), [rules](references/review-rules.md).
Profiles: `design-intent`, `design-critic`, `design-readiness`, `design-domain`
(never `reviewer-*`).

## Obligations

| ID  | Output                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Author states request, current source behavior, alternatives, non-goals, unknowns; reconciles authority and predecessor. Do not optimize an invented problem. |
| O2  | Fresh I: **two full paraphrases** of the proposal **and** the stated current system, even with no findings. Necessity/reuse/missing context.                  |
| O3  | Separate independent C: source/contracts/failure/recovery/integration. Add D only for a named uncovered material hazard.                                      |
| O4  | Named claims, actual read paths, extra same-pin sources, missing coverage. Unknowns stay unknown.                                                             |
| O5  | Coordinator dispositions with stable finding IDs; preserve original severity `blocker\|major\|nit`.                                                           |
| O6  | Materially affected claims get **fresh** rechecks and a post-fix simplicity check. Applied fix ≠ verification.                                                |
| O7  | **New** fresh R on the **exact** final execution briefs, not a renamed C or author self-review.                                                               |
| O8  | Authorized build/integration/checks, then one final Astra on immutable `base..head`.                                                                          |

Account for every applicable row. “Not applicable”, blocked, or an **explicit**
incomplete-review exception is visible. Never call incomplete coverage complete.

## Roles

| Role | Profile                  | When                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I    | `design-intent`          | One initial fresh child every feature checkpoint. Fresh I after material intent/comprehension change or significant new defensive complexity.                                                                                                                                                                              |
| C    | `design-critic`          | The other initial child, **parallel with I** on the same packet. Neither sees the other's opinions.                                                                                                                                                                                                                        |
| R    | `design-readiness`       | **One new fresh child after** resolution and the execution outline are final. Important R finding → repair, not automatic handoff.                                                                                                                                                                                         |
| D    | `design-domain`          | One per uncovered material domain (named question, sources, failure consequence). Not one per file. Sequentialize if more than **three** readers would run at once. Read-only: never live/paid/auth-probe; required active probe is an evidence gap for a separately authorized P.                                         |
| P    | existing worker or self  | Cheap lookup yourself. Delegate one P only for a bounded genuine evidence gap. Novel loss/privilege/ambiguous-write contract: prove or block. Required live/paid/auth probe: coordinator routes a separately authorized bounded P via existing execution policy; D reviews returned evidence and never performs the probe. |
| W    | existing worker/designer | After authority: one independently verifiable file/contract unit. Merge coupled edits.                                                                                                                                                                                                                                     |

I/C/R/D and material rechecks are `fork:false` (new transcript, **not** a
sandbox). Same model ≠ independence. Same-pass source continuation is **not** a
repaired-design review. Rechecks get a neutral changed-claim list and sources,
not rebuttal text. Readers do not get author conversation history, chat, other
reviewer opinions or a preferred verdict.

**Clean feature:** I+C then fresh R = **3** launches, not a cap or maximum. No
fixed 2-reader / 1-recheck ceiling and no endless swarm.

## Workflow

1. **Triage.** Clear-fix fast path. For a feature, record scope and
   go/assessment-only/goal authority. Stop unauthorized expansion.
2. **Ground.** Inspect current source and reused infrastructure. Probe critical
   unknowns with safe P, or mark the claim blocked. A plausible interface is not
   a probe.
3. **Draft and reconcile (O1).** One design: request, current behavior,
   alternatives with rejected reasons, contracts/failures, tentative units.
   Compare to the actual request and recorded decisions. Quote contradictions or
   consequential additions (architecture/interface/dependency) and resolve
   through **existing** authority. Freeze packet identity. No production code
   before go.
4. **Initial wave.** Launch I+C on that packet. If framing is fundamentally
   unsettled, run I first and hold C until repair, then fresh I on changed
   intent. Add justified D once its evidence exists. If I cannot understand the
   request, do not treat contemporaneous C comments as final R.
5. **Resolve (O5).** Inspect source, not votes. Per finding:
   fix / contest / escalate / decline / accepted-risk. In-scope repairs need no
   extra click. New behavior, accepted important risk, or missing business facts
   go to @ultimate on the existing question card. Hands-off uses existing goal
   decisions.
6. **Revise (O6).** Amend design/coverage. Post-fix zoom-out: drop speculative
   abstractions and compatibility shims the task does not need; keep necessary
   recovery.
7. **Outline + fresh R (O7).** Write actual worker briefs **before** calling R.
   R checks the whole outline, changed claims and new complexity. R may close
   C's repairs only by actually checking them — do not auto-schedule C as well.
   Include consequential factual premises retained after important findings were
   contested, limited to facts underpinning final execution. Export each claim
   and pinned source locators neutrally, without the prior verdict or persuasive
   rebuttal. R independently traces the underlying fact: e.g. “the existing
   operation is atomic” when that premise justifies omitting recovery.
   Map R's evidence back to the existing obligation record. Reopen a settled
   disposition only on **new contradictory evidence**; do not relitigate
   legitimate business choices or accepted risks.
   If R uncovers a design decision, resolve it and send a **new** fresh R (plus
   affected I/D).
8. **Decision.** One ordinary assessment: design/review status, allocation,
   unresolved decisions, evidence. Existing build go remains if scope unchanged.
   No ceremonial extra permission question. On go, `plan` copies reviewed briefs
   and links packet/readiness/authority. New contract/acceptance details
   invalidate coverage before dispatch.
9. **Implement (O8).** Split rule below. A worker that hits unplanned
   behavior/contract **stops that unit** and returns evidence; it does not
   redesign, spawn a review team, or treat “ready” as permanent authorization.
10. **Verify.** Coordinator inspects diffs and recorded check/test outputs,
    independently runs project `pnpm check` **and** the affected tests after
    integration (a worker DONE claim is neither), then the single-final-Astra
    route. Research/design assessment alone is never submitted as
    implementation.

No stage-selector, section-by-section approval maze, or per-reader go card.
Long reports stay in files. @ultimate shows one Design review section on the
existing coordinator result card.

## Iteration (coverage, not a round cap)

A **wave** is a batch of independent readers. A **revision** changes
design/outline/source binding. An **attempt** recovers one failed reader. Model
retries are not new reviews. Keep an obligation table `{claim/finding, scope,
packet, lens/evidence, disposition, fresh check, state}` in the review record.
Stable IDs remain when disposition changes. Preserve original severity; contest
with evidence rather than silently downgrade.

| Event                                               | Next                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No important open finding; final outline ready      | R once if not already on that outline; stop if exit holds. Initial C is not final R.                                                                                   |
| Typo/layout only                                    | Coordinator verifies; **0** new readers.                                                                                                                               |
| Missing source at **same** pin, no design change    | Same reader may continue; not a repaired-design certification. Incomplete while missing.                                                                               |
| Intent/non-goal/comprehension changed               | Fresh I; C/D only if contracts/hazards change; fresh R if outline binding changes.                                                                                     |
| Technical repair, **same** intent                   | Fresh R can verify affected repairs **and** the full final outline. Fresh C first only if architecture still precedes an actionable outline.                           |
| Significant new defensive complexity                | Fresh I (necessity/zoom-out) + final R. C only if architecture still undecided.                                                                                        |
| Domain assumption/probe changes                     | Fresh D per affected domain, then R. D reviews returned evidence, never performs the probe. Unaffected I/C stay scoped to their packet.                                |
| Source advances, changed paths irrelevant           | Record pinned diff/overlap; **0** new readers.                                                                                                                         |
| Relevant source/interface or brief changes after go | Pause affected units; repin; affected C/I/D as above and fresh R before redispatch. Existing go covers only unchanged scope.                                           |
| Contested duplicate, same evidence/scope            | Keep original severity and settled disposition; **0** automatic readers. New contrary evidence reopens an explicit obligation. Comprehension gaps cannot be contested. |
| New important finding from R, or a failed repair    | Resolve; new fresh R on the revised final outline, plus affected I/D.                                                                                                  |

**Ready for handoff** only when: authority still applies; paraphrases adequate;
relevant sources/probes checked or precisely excluded; every important finding
has a valid disposition; important fixes have fresh verification on current
affected claims; post-fix complexity checked; required readers completed their
scopes; final R covers the exact execution outline. Accepted risks name existing
user/goal authority and stay visible. Nits may be declined. Ready ≠ zero
findings, code correctness, or two-clean-round convergence.

Unknown contract, unresolved behavior choice, absent required source/reader, or
unaccepted important risk → **blocked / incomplete / readiness pending**. The
user may direct work despite incomplete review only as an **explicit exception**,
never as completed coverage.

Before first dispatch, estimate launches from actual hazards (clean medium 3;
intent repair ~4; high-risk ~5 review readers + 1 P). Record the range and
reason. **Reassess before the next wave would exceed that estimate, or after two
consecutive repairs fail the same important obligation.** Reassessment is not
approval. Narrow/split, obtain targeted proof, or return continue/redraft/risk
to @ultimate. Hands-off may decide through existing goals. No per-reader money
cards. At oscillation, name the failed assumption and changed tactic. One new D
is for missing domain knowledge, not a fresh vote. If no new evidence/tactic can
improve the result, stop. Ordinary continuation within the stated estimate needs
no new user question.

Paper traces (not runtime proof): small fix 0; clean medium 3/2 waves; repaired
medium 5/4; high-risk 5 review + P1 / 3 waves; two failed repairs of the same K
stop without automatic R3.

## Launch, recovery, Stop, forks

```text
subagent start { agent: design-intent|design-critic|design-readiness|design-domain,
  task: <packet + rules + pinned index + mandate>, background: true,
  fork: false, isolate: 'none' }
```

Preflight the **effective** profile: `openai-codex/gpt-6.1-sol`, `thinking: high`,
`tools: [read, bash]`, `isolate: none`, `summaries: false`. After return, trust
the envelope **Returned model**, not self-attestation (which may be unavailable).
Unavailable pin falling back to the parent is **not** a Sol review — stop.

A completed role must actually read its pinned target, persona, every supplied
standard/source needed for claimed coverage, then return paraphrase/coverage/
evidence. Unread required material → incomplete. Empty, generic, wrong-target or
non-Sol → **incomplete / not run**.

Watchdog owns provider recovery. **Do not start a replacement while a watchdog
continuation is pending.** After that action is terminal, one fresh replacement
for that failed/poor role may launch (`attempt=2`, new child ID). Another failure
stops for diagnosis. A replacement is not an extra clean vote. **User Stop never
triggers replacement.** Parent stop does **not** cascade. Stop captured children
explicitly through their **original owning coordinator**. Late answers on
cancelled/superseded packets are history, not current coverage.

Compaction/restart: reread exact refs/authority before dispatch. Same-owner reset:
stop captured children through that owner's index, then reestablish task/scope.
An ordinary independent fork must **not** stop the source conversation's unrelated
children. Explicit replacement fork: record original owner/child IDs; @ultimate
routes cleanup to that original coordinator; verify Stop receipts before
replacement dispatch. The fork's fresh index cannot cancel another owner's
children. Missing Stop receipts **block** replacement. Stale questions are
superseded in the replacement message; agents cannot dismiss user questions.
Sidechat analysis is not new authorization. Decisions are recorded through
@ultimate main's existing message/question/goal flow, after checking
applicability. Prior go covers unchanged scope only.

## Implementation split and final Astra

Parallelize only **disjoint file ownership and stable shared interfaces**. Same
types/server state machine → combine or serialize. A dependency needs an
inspected/landed predecessor commit. Coordinator owns integration, overlap,
cross-boundary tests, actual output vs DONE claims, and the product verdict.
Failed checks block. New implementation findings reopen affected design
obligations.

Use the current user-approved execution/model policy, honoring any active
implementation trial and safety pause. Only when the native Cursor route is
selected, keep its serial, committed-HEAD, non-fast job constraints (≤10 min);
never revive a paused route or silently substitute one. Sol supporting reviews
remain distinct from implementation. Do not change the reviewer team.

After `pnpm check` and the affected tests: one final Astra on immutable product
`base..head`:

1. Preflight: effective `reviewer` is pinned `openai-codex/gpt-6-astra` with the
   full lone-review mandate; that model is available; **zero** effective
   `reviewer-*` leaves. Else stop and ask @ultimate for a review-configuration
   decision — no silent fan-out, no second Astra, no project-correctness leaf
   alone.
2. `subagent start { agent: 'reviewer', task: <range + acceptance/evidence>,
   fork: false }`
3. Verify returned model and lone-review report. Unexpected model/team →
   requirement unmet.
4. Corrections use **that same** reviewer conversation and a new immutable head.

## Artifacts and authority

Freeze reviewed design + outline via a reachable focused documentation commit,
or exact bytes + digest in the durable review record (not `/tmp` alone). Put
source/authority/answer refs in the review record so the design commit is not
self-referential. Git pins are operational practice, not immutable-only access.

Readers have read/bash and may still inherit AGENTS/personal/extensions. Give a
pinned path index; relevant extra same-pin regular sources are allowed and must
be reported. Never retrieve author conversation history, chat, memory, inbox,
database, auth, env or secrets. Pinned Git source objects may be read. The
history ban is author conversation history, not Git. Readers never write, build,
test or execute source. Missing required context is a gap, not broader tools.

No new plan/memory engine. Planning may live in the design file before go;
implementation stays after go.
