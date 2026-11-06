---
name: design-checkpoint
description: >-
  Risk-based design checkpoint using one compact contract, focused independent
  readers for unresolved questions, executable checks and targeted repair
  reviews. Use before implementation when behavior or boundary contracts are
  uncertain; full EGM-style audit is explicit opt-in.
---

# Design checkpoint

Use risk screening, focused questions and executable evidence to decide how much
design work is needed. A feature label does not require I+C+fresh R, full
paraphrases or a separate handoff review. One coordinator owns the decisions.
**Full EGM-style audit is explicit opt-in:** only when the user asks for it, read
[references/full-audit.md](references/full-audit.md). Sensitive work gets focused
scrutiny under this default; it does not silently activate the full audit.

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`; modified for Ultimate, not EGM-certified.
See [UPSTREAM.md](UPSTREAM.md) and [LICENSE](LICENSE).

## Screen and ground

Read the request, current flow and callers before choosing the smallest path.
The coordinator owns bounded research of uncertain choices and concrete scope-cut
proposals before disproportionate complexity; material scope changes need user or
explicitly delegated authority.
Record acceptance, existing authority, risk boundaries and unresolved questions
in the existing plan or design. Keep one compact requirement → invariant → check
contract with source pins and evidence links; no second ledger, complexity score
or mandatory document set. The [contract template](references/design-template.md)
is optional structure, not a form to fill for an obvious one-line fix.

- Known, local, reversible work with a clear check needs no design reader.
- Established multi-component work needs only the readers that answer unresolved
  material questions; implement directly when source and a check settle them.
- Identity/private data, privilege, durable jobs, external writes, concurrency,
  migrations or broad impact need scrutiny before the risky part is implemented.
  Name the invariant and prove critical library/recovery contracts early. Use a
  focused independent reader where consequential assumptions remain uncertain.
- Conflicting evidence or no valid oracle calls for a bounded probe or independent
  diagnosis of the failed assumption, not several identical reviews.

Reuse code and platform contracts before designing new machinery. Reader roles
are lenses to select, not stages to complete: `design-intent` for unclear intent
or necessity; `design-critic` for technical contracts; `design-domain` for a named
hazard; `design-readiness` for a genuinely uncertain execution split. Each task
names the question, failure consequence, pinned sources and expected evidence.
Read [review rules](references/review-rules.md) before dispatch. There is no
minimum reader count or blanket paraphrase requirement.

## Resolve and implement

Choose a bounded next action that resolves the open question: inspect a caller,
run an authorized probe, implement an understood unit or seek a targeted review.
Readers inspect sources; they do not execute probes. Route a required live,
paid or authenticated probe to an executor under the existing task authorization;
ask only if that action exceeds it.

Keep findings and dispositions beside the contract ([record fields](references/review-record.md)
if useful). Preserve stable IDs and original severity; inspect evidence instead
of counting votes. Verify repairs with the affected executable check and the
**same reader conversation** when review is needed. Give that reader the finding,
new pin and precise repair scope. A fresh independent reader is for a changed
trust/model assumption, contradictory evidence or an uncovered hazard, not every
revision. Recheck affected dependencies and invariants even if the reviewed file
itself did not change. Keep unaffected evidence with its original scope and pin.

Two consecutive repairs failing the same important obligation require a changed
tactic, bounded diagnosis or escalation before another attempt. If no new evidence
or tactic can resolve it, stop the affected work and report the blocker. Repeated
fresh votes do not settle it. Strengthen reasoning on the unresolved question
before adding workers; use existing `subagent start` family/model/thinking
overrides within the approved model policy. Reduce scope again when the
uncertainty is resolved.

Existing build authority covers unchanged scope. Assessment-only stays
assessment-only. For missing product facts, changed behavior/scope or accepted
important risk, send decisions to @ultimate first. It either names existing
user/goal authority or tells the coordinator to ask the user in the branch's
own conversation; `hold` means @ultimate is consolidating the question. Agent
agreement, a side chat summary and an elapsed wait are not authorization.

One owner implements unless bounded delegation pays. Briefs reference the same
contract ([handoff fields](references/handoff-template.md)); workers own private
implementation detail. Parallel work requires disjoint files and stable shared
interfaces. Coupled edits share an owner or run sequentially. A worker stops the
affected unit on an unplanned behavior/contract and returns evidence.

## Verify and finish

Preserve the current execution route and safety pauses. Only when separately
authorized to use the native Cursor route, retain serial jobs from committed
HEAD, non-fast execution and the ten-minute limit; this recipe never unpauses it.
Inspect integrated diffs
and actual check output, run the project's required checks and affected tests on
the delivered revision, then obtain one independent final code review on exact
immutable `base..head`, with the original request, authorized scope changes and
acceptance criteria, using the configured review family. Design readers do not
substitute for it. Keep corrections in that final reviewer's conversation and
repin its range. Available `reviewer-*` definitions are a specialist catalog,
not an instruction to launch them all; honor the current single-reviewer policy.

Preflight effective reader/reviewer instructions, family model, thinking, tools
and availability; after return verify the actual returned-model envelope. A
fallback, missing required source, empty or wrong-target response is incomplete,
not clean. First readers use `fork:false` and a neutral source packet, without
author chat, prior verdicts or persuasive rebuttals. This is independence, not a
sandbox. The review rules preserve read-only, recovery and child-stop boundaries.

Finish only with acceptance evidence, required checks, valid authority and no
unresolved blocking findings. Report uncertainty and accepted risks accurately;
budget exhaustion or a review receipt alone is not completion. Update the
existing plan/result with concise evidence, not a new progress essay or ledger.
