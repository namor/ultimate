## Subagents

Definitions with `resident: true` have one standing conversation per project, reached by the subagents service and pinned in the sidebar's agents group; deferred tools explicitly named in a definition are offered only to conversations configured from it.

A `watchdog.failure` card reports a child's provider failure, with its error and last step; temporary errors get one automatic retry first. Check the child before resuming it with a message, or ask @ultimate when the user must act. A successful retry's answer arrives as a normal subagent report.

Use `subagent` to delegate bounded research, recon, review, or isolated implementation; verify the results. When no definition fits, `start` without `agent` makes one on the fly from `label`, `family` or `model`, `thinking`, `tools` and `instructions`. It is never written to disk, and the sidebar shows it with a wand, its label and its model (see `extensions/subagents/README.md`). Foreground calls return the child's answer or yield on queued steering while it continues running. All new children survive the parent's stop; use explicit child stop, which lists files left uncommitted in the child's worktree. Undelivered answers, including the answer to a one-way `message` the parent sent the child, steer the active run at its next tool-round boundary, or start a run when idle. Start, message/steer, wait, stop, and list all use child conversation IDs. Children cannot delegate by default. Only definitions explicitly listing `subagent` in `tools` retain the tool and
extension, subject to the parent's tool subset. Coordinator behaviour lives in `agents/coordinator.md`.

Definitions live in `agents/`, `~/.ultimate/agents/`, and the project root's `.ultimate/agents/` (later wins by name; a later file marked by `addTools`, an overlay, extends the earlier one instead: it may override any setting such as `model` or `thinking`, adds tools with `addTools`, adds denied tools with `denyTools` and appends its body, but never replaces the instructions or the `tools` list), and are reread at every start; the Agents panel lists them under the model family each runs on. `tools` is an optional YAML list selecting the parent's tools; omitted, it inherits them. `denyTools` is a YAML list of strings removed from either that explicit list or inherited tools; overlays add their entries to the base deny list, and unknown tool names are silently ignored. `summaries: false` turns off the automatic summary model for every conversation the definition configures (no generated title, sidebar summary, reply activity, spawn refresh or abstract; explicit `askSummaryModel` calls still work), as standing agents, the lander and side chats are: use it for agents whose conversations are temporary or keep a fixed title. See `extensions/subagents/README.md` for frontmatter. Shipped definitions name a model family instead of a model (`family: fast`; see "Model families" in `extensions/models/README.md`): `ultimate` and `coordinator` default, `reviewer` review, `worker` and `dream-pass` fast, `scout`, `watcher` and `voice` tiny, `designer` design. A definition's own `model` pins it to one model; moving an agent to another family in the Agents panel saves its definition (an overlay for a built-in).

## Adaptive work and review

One coordinator owns delivery. Screen authentication, private data, durable work, external writes, concurrency,
migrations and broad impact before choosing the next action. A local reversible change with a known check can stay
with its owner. An ordinary feature needs a concise plan, executable acceptance evidence and independent final
review, with no mandatory design readers. Sensitive changes get early targeted review and checks for the named
boundary. A missing contract calls for a bounded probe; a repeated failure calls for a changed tactic. Authorized
build requests do not require another assessment permission loop. Use `design-checkpoint` for meaningful design
uncertainty or an explicitly requested full EGM audit; ordinary features do not require it.

Use the existing `start` call's `family` or `model` and `thinking` on named or ad hoc agents. Respect models and effort explicitly pinned for the task; otherwise explicitly select `thinking: 'medium'` for bounded discovery, implementation or review and
`thinking: 'high'` for a named unresolved risk or high-risk review. Omitted effort can inherit the parent's setting.
Pass a required model pin explicitly at start so an unavailable model fails instead of falling back. Check the returned
model and available configuration evidence; unknown actual effort remains unknown. Stop and report a pin mismatch. This policy does not
change global defaults or authorize replacing user pins.

Briefs name the source revision, acceptance criteria, unresolved questions and source/check references rather than
copying the transcript. Keep one behavior contract and its test obligations. Summaries are navigation aids, not proof;
reuse check evidence only while the relevant code, dependencies and environment still match.

Final review goes through one fresh `reviewer` with `fork: false` and an immutable full-SHA `base..head` range. It is
independent of implementation and early design readers, and owns one review verdict. Available `reviewer-*`
definitions are a catalog; add one only for a named uncovered hazard, not because the definition exists. Here
`.ultimate/agents/` offers three specialties. The lead inspects their evidence, deduplicates root causes and preserves
material disagreements. Repairs return to the same reviewer and relevant specialists with the new range and checks;
fresh scrutiny needs a material reason for independence. The coordinator owns final acceptance, and the lander runs
required checks on the merged revision.

Existing child reports, automation events and supervised scripts handle waits. Bound startup and I/O deadlines,
check durable state before retrying side effects, and wake a model only for a meaningful transition, blocker or
decision unless periodic updates were requested. Script polling is never faster than the watcher's 30-second minimum.
These policies preserve explicit child stop, durable report delivery and lineage ownership described above.

## Usage and calibration

At a planning, repair or acceptance checkpoint, read `ultimate.action('status-line', 'usage', {conversation: id})`
for recorded own usage plus owned descendants. The composer’s **task usage** view shows the same data. Native
`pi.usage` already persists across restarts; fork history does not become new spend. The plan task’s existing child
link supplies task attribution. No phase classifier, request ledger, automatic token ceiling or new scheduler is added.
Missing counters stay unknown, and native aggregates cannot reconstruct missing requests or prove subscription quota.
See [the usage contract](../extensions/status-line/README.md) for coverage limits.

This policy changes the work chosen and the explicit effort on bounded child calls; it leaves global model families
and existing conversations’ models/effort unchanged. Coordinators still use their configured family. Escalate a named
unresolved question through the existing start controls rather than changing every conversation mid-flight. An explicit
task pin takes precedence over adaptive effort. Full audit retains its deliberate review procedure in
[design-checkpoint](../skills/design-checkpoint/SKILL.md).

Savings and preserved quality require measurement. Keep existing evaluation attempts frozen. Compare matched tasks
with policy changed and effort fixed first, then vary effort with policy fixed, then context packaging. Use ordinary,
sensitive and misleadingly small tasks; grade executable behavior and confirmed defects before cost. Existing defect
examples are regression cases, not held-out evidence. Report unverified coverage and accounting gaps; fewer readers
or a lower token total alone is not success.
