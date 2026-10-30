# Elephant–Goldfish, examined: mechanisms, limits, and the Ultimate adaptation

**Research freeze: 2026-10-30.** This is a source-grounded design analysis, not an installation, an EGM certification, or a measured productivity claim. The comparison is between Google’s pinned plugin, Ultimate’s strengthened proposal, and a separately pinned resource draft. Those are three different evidence objects.

[Open the portable visual comparison](comparison.html) · [Editable HTML source](comparison.src.html) · [Build and visual verification](VISUAL.md) · [External evidence](EXTERNAL-SOURCES.md) · [225-path source coverage](UPSTREAM-COVERAGE.csv)

## Verdict

EGM’s most valuable idea is **controlled information asymmetry**: keep an author who remembers intent, but test the exported design with readers who did not participate in its creation. Its strength is not a swarm by itself. Its strongest interactive form is the sequence **frame → explain → challenge → resolve with evidence → remove review-induced complexity → verify an executable plan**, while preserving human decision authority. This is a conceptual summary of that form, not a claim that every preset performs repair or convergence.

Ultimate’s adaptation could fit this repository better because its final fresh reader examines **the actual worker briefs, source revision, coupled ownership, and lifecycle boundaries**. That is a plausible reduction in handoff mistakes, not a demonstrated quality advantage. It gives up independent specialist sampling, upstream documentation bootstrapping/drift workflows, some human decision checkpoints, and—against Google’s Claude adapter—stronger mechanical reviewer tool restrictions. Four Sol profiles with shell access are **not** four independent experts or a sandbox.

**Recommendation:** retain the strengthened design as a bounded experiment; verify the clarified resource revision and actual workflow before activation. Later loader/faux-child fixtures provide bounded mechanics evidence (§6.5), not live compliance. Measure against both ordinary Ultimate and the relevant upstream preset. Do not build a new workflow engine, expand permissions, or promise that this port is already better.

### Read this report

- [1. Evidence and versions](#1-evidence-and-versions)
- [2. What is actually shipped](#2-what-is-actually-shipped)
- [3. The complete upstream workflow](#3-the-complete-upstream-workflow)
- [4. Why the mechanism can work—and break](#4-why-the-mechanism-can-workand-break)
- [5. Research outside the repository](#5-research-outside-the-repository)
- [6. Ultimate’s design and real draft](#6-ultimates-design-and-real-draft)
- [7. Side-by-side comparison](#7-side-by-side-comparison)
- [8. Authority and runtime boundary audit](#8-authority-and-runtime-boundary-audit)
- [9. Cost, allocation, and small-fix exceptions](#9-cost-allocation-and-small-fix-exceptions)
- [10. Repairs and a falsifiable evaluation](#10-repairs-and-a-falsifiable-evaluation)
- [11. Coverage, checks, and unknowns](#11-coverage-checks-and-unknowns)
- [Source index](#source-index)

Companions: [external source ledger](EXTERNAL-SOURCES.md), [225-path coverage ledger](UPSTREAM-COVERAGE.csv), and [research notebook](RESEARCH-LOG.md). The visual comparison is a shorter reading aid, not a replacement for the qualifications here.

## 1. Evidence and versions

| Object                         | Frozen identity                            | What this establishes                                                                                                                  |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Google EGM                     | `5efe34126a0059eff51ca7e0af7e3249d70952bf` | Actual upstream source, 225 tracked paths; plugin metadata version 0.1.0                                                               |
| Earlier EGM input to Ultimate  | `f0ba151b252c9abf1318d9fe857a43265d06de89` | Difference to current pin is only root/distributed README’s Antigravity 1.4.10 command-prefix note; no changed skill/persona mechanism |
| Strengthened Ultimate proposal | `3b1d5b1967d486e91133881870cf89503f277508` | DESIGN, PORT-MAP, SEAMS, DRY-RUNS, review history and worked examples                                                                  |
| Actual resource draft          | `906a10a0c772c4465689e39482d93524f9b9fe0a` | 14 files, +1,132 lines; no installed or active workflow implied                                                                        |
| Ultimate runtime baseline      | `1475c80e27fe540cf600805df6d40dbc7b8abff5` | Latest upstream main fetched before this research branch; not the older `18aa7e29` used by the plan’s historical examples              |
| Visual Explainer               | `5f378868e0ea745a6284b51e710c390f0c76f72c` | Canonical skill v0.14.0, MIT; artifact workflow, not an installed Pi Durable plugin                                                    |

Retrieval date is not publication date. The official Google post is **October 22, 2026**, by Brian Suchy and Dave Rensin [E1]. Source pins are immutable; external web pages can change.

**Evidence vocabulary:**

- **Source fact:** text or executable behavior present at a named pin.
- **Prompt obligation:** the model is instructed to do something; compliance is not thereby enforced.
- **Runtime constraint:** a host actually restricts tools, ownership, or task transitions.
- **Executed check:** a command ran here with observed output.
- **Reported check:** another recorded run or publication claims a result, with provenance.
- **Hypothesis:** a causal prediction requiring comparative evaluation.

The report deliberately does not collapse these categories. “Review complete,” “resolved,” “ready,” “approved,” and “implemented correctly” are not synonyms.

## 2. What is actually shipped

### 2.1 A prompt protocol, not a hidden agent platform

The plugin supplies seven skills, nine canonical agent files, five document standards, host metadata/adapters, templates, packaging scripts and tests. The nine agent files are **seven reviewer personas plus a synthesizer and bootstrap orchestrator**. The website, screenshots, release machinery and test fixtures are not an additional reasoning engine. [U-manifest, U-pack, U-harness]

| Layer                                  | Function                                                    | Not established by its presence                                   |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `skills/*/SKILL.md`                    | Model-readable workflow, handoffs, gates and stopping rules | Deterministic execution of those rules                            |
| `agents/*.md`                          | Lenses and output expectations                              | Independent expertise or capability confinement                   |
| `resources/document_standards/`        | Framing, specification, readiness and contract criteria     | A task-relevant finding merely because a checklist item is absent |
| Claude adapters                        | Named roles, tool allowlists, instruction/memory choices    | Filesystem sandbox or universal host-policy isolation             |
| Codex/harness guides                   | Native fresh-spawn and resource-read expectations           | Every host/version complying equally                              |
| `pack_plugin.py`, `prepare_release.py` | Allowlisted, reproducible distribution/release construction | Review orchestration or model quality                             |
| Unit/integration tests                 | Package structure and selected harness/trace behavior       | A general defect-reduction benchmark                              |

`disable-model-invocation: true` appears in skill frontmatter; host support determines its meaning. The portable manifest deliberately omits a schema declaration because one host’s strict schema rejects that field. Canonical persona frontmatter largely supplies name, description and license. It is not equivalent to Claude’s separate tool allowlist. Blindly copying all frontmatter into Ultimate would not preserve behavior. [U-harness, U-unit]

There is no EGM-specific hosted database, account, analytics endpoint, MCP server or automatic retention service. Local documents persist; the host/model provider still processes inputs under its own settings. No bundled permission-approval hook is installed. Optional project formatters may themselves have side effects or network access. “Local plugin” does not mean confidential input never leaves the machine. [U-privacy]

### 2.2 Elephant and Goldfish are information roles

**Elephant:** the continuing author owns the request, prior discussion, reasons for rejected alternatives, constraints, and reconciliation. This continuity prevents a succession of fresh agents from forgetting why the work exists.

**Goldfish:** a new conversation sees a deliberately selected artifact and relevant source, not the production conversation. It tests whether the artifact carries enough information and whether its claims survive independent inspection.

Three distinctions matter:

1. **Transcript freshness** removes one source of anchoring; it does not remove shared model training, shared prompts, or correlated code misconceptions.
2. **Source access** is necessary to reject imaginary APIs. It is not contamination simply because the reader sees the repository.
3. **Information/capability confinement** is separate. A fresh child can still have filesystem tools, project instructions and host memory surfaces. Google’s Codex guide says so explicitly. [U-codex]

The right aim is not maximum ignorance. It is **enough task truth, without the author’s persuasive history or preferred verdict**. A reviewer deprived of required business constraints can be confidently wrong; a reviewer given the entire debate can rationalize the author’s favorite answer.

## 3. The complete upstream workflow

### 3.1 Brainstorm: challenge the premise before paying for the spec

`egm-brainstorm` starts with open-ended clarification: root problem, consumers, non-negotiable constraints and non-goals. It asks for confirmation of an anchored hypothesis before launching a shootdown. Six lenses examine YAGNI/reuse, cost/quota, UX, migration, observability, and maintenance. The concepts brief preserves scope, risks, decisions and alternatives for drafting. A rejected alternative’s reason is useful context, not clutter to be reinvented later. [U-brainstorm]

The skill’s conceptual lenses and the synthesizer’s named persona mapping are not a perfect one-to-one catalogue: the synthesizer uses six reusable persona files. Consequently, a host must preserve the actual brainstorm mandate, not infer complete SRE expertise from a role title. A swarm that only repeats six generic warnings has spent tokens without improving the premise.

The final choice can be further refinement, a locally written RFC/team-feedback artifact, or drafting. A publishing label is not independent authorization to perform remote publication. The workflow’s protection against sycophancy is concrete objections and alternatives, not an instruction to sound hostile.

### 3.2 Draft: reconstruct intent without smuggling in new decisions

`egm-draft` selects its predecessor from an explicit file, concepts brief, discussion summary, or interactive intake. It writes incrementally: goals, technical architecture, alternatives and detailed implementation. Section approval limits the amount of unreviewed invention. It prefers an artifact over dumping a large document into chat. [U-draft]

At finalization the author compares the draft to its predecessor. This is **not author self-grading against the independent zoom-out rubric**. It detects both contradictions and additions: a new dependency, interface or architectural choice can change scope even when it contradicts no sentence. It quotes evidence and returns decisions to the owner. The predecessor is not infallible; current source may justify changing it.

A particularly strong—and costly—upstream policy is that the owner chooses among defensible architectural alternatives even when asking the agent to choose. The scenario suite explicitly tests this. It protects intent from silent delegation, but can frustrate a user who deliberately wants a recommendation or authorized autonomy. Ultimate should not import that policy unchanged.

The implementation section enumerates file actions/rationales and verification, without dumping production code. Semantic sections create a high-level **FeatureRange** and **DetailedRange**. Finalization can register the document and add a `Drafted with EGM` footer. This watermark records provenance, not correctness, approval or a cryptographic source receipt.

### 3.3 Review: five stages, not the blog’s three-part simplification

The current skill’s review stages are numbered **5–9** after intake/preset/scope setup. [U-review]

| Stage                    | Lens and target                                                     | Distinct question                                                                        |
| ------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 5. Initial zoom-out      | Whole design, skeptical architect                                   | Is this the right problem and simplest justified approach? What already exists?          |
| 6. Comprehension         | Naive project reader                                                | What does the proposal mean, and what current system does it claim?                      |
| 7. Critic                | Design critic + structural + style, feature scope                   | Are architecture, failure modes, trade-offs and presentation coherent?                   |
| 8. Intermediate zoom-out | Whole revised design, especially additions                          | Did responding to criticism add speculative machinery or reopen settled framing?         |
| 9. Readiness             | Implementation readiness + codebase details + style, detailed scope | Can an implementer act without inventing missing contracts or trusting nonexistent APIs? |

**Order is causal:** a detailed review of an unnecessary feature wastes effort; a technical critique of a misunderstood proposal critiques the wrong thing; a repaired design can become more complicated than the original; a sound concept can still yield unusable execution instructions.

The skill has different presets, including interactive full review, uninterrupted full review and feature-only paths. Their consequences cannot be averaged into one mythical default. Interactive critic/readiness subflows use the review loop; uninterrupted mode dispatches stages and consolidates findings without the same interleaved human repair loop. Feature-only review must not certify an unreviewed detailed plan. Semantic bounds are rediscovered after edits, not trusted as stale line numbers.

The intermediate zoom-out receives the initial zoom-out report. That is deliberate continuity of settled framing, **not total blindness to all prior review evidence**. It risks anchoring but avoids endlessly relitigating accepted architecture. The useful independence claim is therefore scoped: no author conversation does not mean no earlier artifact is ever shared.

### 3.4 Comprehension’s paraphrases are a test, not decoration

The reader writes two complete 2–5 sentence paraphrases: **what is proposed** and **how the existing system works according to the document**. They remain in the report even with zero findings. This stage bypasses the synthesizer so “no issues” cannot erase the actual interpretation. It does not apply the re-implementation standard. The reader is a competent engineer unfamiliar with this project, not someone who needs ordinary software terms defined. [U-comprehension]

Why this matters: a design can be grammatical and internally consistent while describing the wrong thing. Comparing a reader’s reconstructed model with the author’s intent reveals meaning loss that a checklist may miss. A fluent but wrong paraphrase is more diagnostic than an ungrounded “looks good.” Inability to paraphrase is blocking. The author still has to compare the output; retaining it without inspecting it does nothing.

The rule that comprehension gaps cannot be contested prevents an author from declaring “you should already know this.” It should not become a demand to explain all engineering or insert private institutional history into every spec. The source explicitly guards against needless explanatory bloat.

### 3.5 Seven lenses and five standards

| Persona                    | Useful specialization                                  | Failure if applied mechanically                            |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `zoom_out`                 | Framing, reuse, necessity, simplicity                  | Rejects essential recovery as “overengineering”            |
| `comprehension`            | Actual interpretation and missing prerequisites        | Demands encyclopedic prose or invents context              |
| `design_critic`            | Reliability, constraints, failure modes, trade-offs    | Invents hyperscale/SLO requirements irrelevant to the task |
| `codebase_details`         | Real paths, symbols and current contracts              | Confuses proposed files with missing existing files        |
| `implementation_readiness` | Actionable plan and verification                       | Requires all private coding choices to be predetermined    |
| `structural`               | Navigation, consistent sections, complete presentation | Heading compliance substitutes for design validity         |
| `style`                    | Precise, factual, concise communication                | Cosmetics outvote important unresolved behavior            |

The five standards are feature specification, Heilmeier framing, zoom-out, implementation readiness and re-implementation. They separate goals/why, scope/trade-offs, simplicity, executable planning, and external contracts. A strong reviewer applies them to the actual risk. A blind reviewer treats every absent item as a defect, generating costly false positives. [U-agents, U-standards]

### 3.6 Synthesis: context compression with a trust cost

The optional synthesizer starts reviewers, normalizes references/severity, deduplicates overlapping findings, writes an artifact and returns a concise status/link. It can optionally run A/B instances of each requested persona. Optional duplicated samples may improve recall; they cannot “eliminate” stochastic gaps or common-mode errors. [U-synth]

Its value is controlling author-context growth and reducing duplicate triage. Its risk is losing dissent, combining superficially similar but causally different defects, changing severity or counting a failed child as clean. The actual prompt includes explicit completed/not-run status and retry rules. Original source evidence and distinct consequences should survive deduplication. Comprehension is kept out of this compression path for a reason.

### 3.7 Resolution: neither automatic obedience nor author veto

The current resolver has **four** categories, not merely accept/reject. [U-resolve]

- **PROPOSE FIX:** a valid gap with concrete correction.
- **CONTEST:** a refutation backed by evidence the reviewer could read. “I intended it” is not evidence.
- **ESCALATE:** the refutation needs information outside the reviewed material, such as an unrecorded business agreement. The human decides.
- **DECLINE:** a nit recorded without a fix.

The author cannot contest a comprehension gap or casually downgrade severity. A critic’s suggestion is not design authority either: unnecessary mitigation can be rejected with evidence, and hidden facts must not be used to manufacture a clean review. The resolution modes preserve user choice over how to inspect/apply repairs.

A report marked **`Status: resolved` can still contain escalations and unaddressed findings**. It means the resolution workflow has produced its disposition artifact; it is not proof that every important defect is fixed. A consumer that equates this status with implementation readiness would be wrong.

### 3.8 Iteration and termination: convergence is an operational decision

`egm-review-loop` re-resolves the semantic scope every round, uses fresh reviewers, preserves stable finding identity and tracks dispositions. A failed/timed-out/no-report reviewer gets one retry, then **not run**, never zero findings. Missing status in synthesis also prevents treating the review as clean. [U-loop]

A clean round has no **unsettled** Blocker/Major and adequate reviewer completion. Nits do not block. Contested or accepted-risk findings remain settled: the upstream rule says not to reopen the same issue at the same scope. It does not state a contrary-evidence exception. Applying a fix does not settle it: recurrence can expose a failed repair or regression. Cleanliness is assessed **before** applying that round’s repairs. Two consecutive clean rounds converge; the default maximum is five. Cap or churn—where resolving a new issue would undo an earlier fix—asks the user to accept, continue or redraft.

Two clean samples are a useful stopping heuristic, not a statistical certificate. Reviewers can miss the same defect twice. A settled contest can also hide a real defect if the author’s evidence was misread; the written same-scope non-reopening rule risks preserving that mistake even when contrary evidence emerges. **Ultimate’s adaptation explicitly reopens an obligation on new contrary evidence** (`DESIGN.md`, allocation table, “Contested duplicate, same evidence/scope”). That is a local policy safeguard, not an upstream guarantee or proof that the coordinator will enforce it. [P-DESIGN] Accepted risk is explicit risk ownership, not disappearance of the risk.

There is another important stopping rule in the outer interactive review skill: some stage re-audits are capped at one and then advance with residual accepted-trade-off language. **Do not confuse this with the loop’s five-round, two-clean policy.** It is a real tension between bounded interaction and complete resolution; residual acceptance must remain visible rather than being silently read as a clean design.

### 3.9 Bootstrap: reconstructable context, not magic memory

`egm-bootstrap` creates or corrects directory contracts: leaf **Peanuts** and parent **Hay**. Interfaces, invariants, side effects, verification and child links make future context reconstructable. This is externalized documentation, not persistent cognition inside a Goldfish. [U-bootstrap]

The canonical workflow:

1. Discover build/test conventions, then breadth-first map one directory level at a time. Ignore symlinks, ignored/system trees; preserve manifests for verification targets.
2. Pause for explicit approval when discovered directories exceed 15. Prune test-only/non-code branches while retaining parents with code descendants.
3. At most five pruned directories use direct bottom-up work. Larger trees partition at shallow depths and run subtree orchestrators. “Unbounded” spawning is still limited by host capacity and quota.
4. Read-only scouts derive facts from real symbols, not folder names. Source is chunked at roughly 1,500 lines around definitions; tests are excluded and template/config reads bounded. Return explicit unknown/None instead of invented invariants.
5. Preserve existing human notes while correcting/upserting contract content; propagate child contracts upward; keep worker scratch/state separate and do not commit.
6. Mark failed/incomplete scouts or workers honestly, verify contracts and links, optionally offer drift checking.

The worker-return schema requires `subtree_index`, and each item’s path/summary; interface/invariant/side-effect arrays are properties but not all required. A schema-valid return therefore does not establish a complete semantic contract. A generated verification command is not a passing test. Excluding tests reduces input volume but can discard the clearest behavioral contract. Parent summaries can amplify a leaf hallucination. Final grounding is essential.

Unlike fresh review, bootstrap permits inline scout steps when there is no subagent tool. That fallback does not preserve cognitive independence, but documentation extraction is a different operation. Ultimate defers this entire workflow; that is a real lost capability for poorly documented repositories, not merely fewer commands.

### 3.10 Drift: maintaining the evidence that future readers will trust

`egm-drift-report` sequentially compares selected design documents/README contracts with source, looking for missing features, incomplete data models, shortcuts and architectural divergence, including discrepancies in the other direction. It writes a dated discrepancy report with source locators; matching scope can be reported as no drift. [U-drift]

It is not a scheduled daemon, deterministic semantic diff, automatic migration or auto-repair. The user decides whether code or design is the correct successor. Sequential processing bounds context/tool load but does not guarantee coverage. Omitting drift from the port means Ultimate must continue using its existing source inspection and memory maintenance; it cannot claim equivalent repository-wide living-spec upkeep.

### 3.11 Host adapters, instructions and failures

Claude reviewers have **Read/Grep/Glob**, no write/shell/delegation tools in their reviewer adapter, `omitClaudeMd: true`, inherited model, and no persistent memory declaration. Synthesizer and bootstrap get different capabilities. Tool withholding is a meaningful defense against a supposedly read-only reviewer executing code. It is still not a filesystem sandbox: readable files and host permission semantics matter. Claude URL reading-list entries require local raw-page material rather than pretending a no-web reviewer fetched them. [U-claude]

Codex uses native fresh spawn with explicit isolation/resource-read expectations; project instructions and accessible filesystem context remain relevant. A declared persona read is weaker than a successful native tool result. Current integration helpers test correlated tool results and missing/denied reads, not just a final answer saying “I read it.” [U-codex, U-unit]

The plugin is subordinate to the host’s instruction/permission hierarchy. Its “CRITICAL” wording does not override the host or user’s actual authority. No fresh-subagent capability means a fresh review must stop rather than imitate independent perspectives in one transcript. No available resource means incomplete review, not invented success. Exact host behavior must be verified on the chosen version.

### 3.12 The repository itself demonstrates documentation drift

The audit found real discrepancies; they are not defects invented to favor Ultimate:

| Location                          | Narrative/checklist                                   | Current operative source                                                           |
| --------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `docs/designs/architecture.md`    | Four review tiers/readiness at Step 8                 | Review skill has five stages, readiness at Step 9                                  |
| `docs/designs/synthesizer.md`     | A/B spawning described as required                    | Persona makes A/B optional                                                         |
| `docs/designs/bootstrap.md`       | Older 50,000-byte/300-line scout limits               | Skill uses larger definition-aligned source chunks                                 |
| `skills/egm-bootstrap/TEST.md`    | No delegation → halt                                  | Skill permits inline scout steps                                                   |
| `skills/egm-review-loop/TEST.md`  | Mentions sequential degraded persona iteration        | Fresh-review instructions require genuine fresh delegation                         |
| `skills/egm-review/TEST.md`       | Older ordering of scope and flow selection            | Current skill/scenario chooses preset before split discovery                       |
| Some design implementation tables | Scenario YAML called benchmark/integration evaluation | Offline test validates scenario shape; no in-repo runner executes those assertions |

Prefer actual pinned skill/persona/runtime code for current behavior, and do not silently merge incompatible documents into a stronger imagined implementation. These discrepancies also illustrate why the port needs source/version checks, not just copied rubrics.

## 4. Why the mechanism can work—and break

This is causal analysis, not an experimental result. “Fresh” is an intervention on information, not a new reasoning faculty.

| Mechanism → assumption                                           | Source observation                                | Potential benefit                                             | Counterexample / falsification test                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Remove production transcript → author-specific anchoring matters | Fresh native reviewers; no author conversation    | Exposes omitted assumptions and less defensive review         | Same model learned same false API; compare same-session and fresh readers with identical artifact/source budgets |
| Preserve author continuity → intent/history are useful           | Elephant reconciles predecessor and alternatives  | Prevents needless reopening and scope loss                    | Author remembers a false agreement; inject predecessor mismatch and require quoted current evidence              |
| Paraphrase before critique → interpretation reveals ambiguity    | Two full paraphrases survive a no-findings result | Detects wrong mental models without requiring a technical bug | Fluent plausible paraphrase hides misunderstanding; blind judge against intended behavior, not wording overlap   |
| Different rubrics → attention changes what is inspected          | Seven lenses/five standards                       | Finds omissions beyond one general reviewer                   | Generic checklist produces irrelevant resilience work; measure valid severe findings and induced complexity      |
| Source grounding → repository truth can refute prose             | Codebase-details/readiness inspect paths/symbols  | Rejects imaginary contracts and stale plans                   | Source changes after review, or future file mistaken for current API; use pinned before-image/future distinction |
| Independent first opinions → disagreement carries information    | Parallel/fresh reviewer dispatch                  | Avoids early consensus suppressing dissent                    | Shared packet misstates intent; compare with independent source acquisition, not merely more personas            |
| Evidence dispositions → findings must survive author preference  | Contest/escalate/fix/decline rules                | Prevents both critic obedience and unsupported dismissal      | Author cites irrelevant evidence; audit rejected true findings separately from recall                            |
| Post-fix zoom-out → local repairs can harm global design         | Intermediate zoom-out                             | Removes speculative layers introduced to appease reviewers    | Simplicity reviewer deletes necessary recovery; regression test the original hazard as well as line count        |
| Fresh final readiness → concept quality is not execution quality | Separate readiness stage; Ultimate exact briefs   | Catches unbuildable ownership and omitted tests               | Readiness reader only re-summarizes design; plant a brief-only contract defect                                   |
| Bounded iteration → additional samples have diminishing returns  | Clean rounds, caps, churn checkpoints             | Avoids endless nits and gives risk ownership                  | Repeated correlated misses look converged; include seeded known defects and record unresolved coverage           |
| Externalized context → documents retain useful truth             | Peanuts/Hay and drift                             | Cheaper reconstruction across sessions                        | Stale summaries reinforce wrong architecture; compare to current source and measure omission/false fact rates    |
| Small-fix exception → review cost depends on uncertainty         | Upstream README/FAQ, Ultimate fast path           | Avoids ritual on a clear one-line fix                         | “Small diff” touches auth/replay; classify by behavioral uncertainty/consequence, not line count                 |

### 4.1 Independence has several axes

**Session independence** is not **model diversity**, **source independence**, **rubric diversity**, or **authority independence**. Four profiles can share the same model, the same misleading brief and the same inherited instruction. Conversely, a same-model fresh reader can catch an author omission without cross-family diversity. A different model can import a different hallucination rather than a better judgment.

A useful approximation—not an EGM measurement—is that review benefit depends on the chance of a material defect, the reader’s incremental detection conditional on earlier readers, and whether the author correctly acts on the finding. Multiplying launches without improving the last two factors buys little. The familiar independent-sample intuition does not apply when errors are correlated.

### 4.2 The central trade-off is anchoring versus missing context

Removing the full author conversation reduces rationalization and irrelevant context load. It also removes legitimate constraints. The exported packet must carry request, non-goals, verified current-system facts and required decision evidence. It should not carry “the author already proved this,” prior verdicts, or a persuasive rebuttal.

The author is responsible for predecessor reconciliation precisely because fresh readers cannot reliably recover excluded history. A neutral changed-claim list can focus rechecks, but an overly narrow list can hide collateral effects. Final readiness should still inspect the whole final execution artifact and important repaired claims.

Compaction creates a related risk: an author summary may retain the winning conclusion but lose rejected alternatives, scope boundaries or uncertainty. A reset/fork is not simply a longer compaction. Exact artifacts and decision locators make reconstruction auditable; they do not make the reconstruction automatic or infallible.

### 4.3 Adversarial does not mean hostile

Sycophantic agreement is bad; automatic opposition is also bad. An adversarial lens earns its place by identifying a falsifiable consequence and accessible evidence. A reviewer who must always find a flaw will create work. A reviewer asked to validate the preferred architecture can rubber-stamp it. Neutral mandates, explicit “none/incomplete,” preservation of dissent, and evidence-based dispositions are more useful than theatrical persona names.

### 4.4 A review system can fail after finding the bug

Finding recall is only half the pipeline. A real defect can be dismissed as intentional, buried during synthesis, marked accepted without authority, fixed incorrectly, or reintroduced by another worker. Review identity, stable issue scope, explicit disposition, repair verification and final integration checks matter as much as fresh spawning. This is why “we ran five reviewers” is not a quality argument.

## 5. Research outside the repository

Two bounded **Luna/medium** researchers used actual Exa Search and Contents calls: one for EGM-specific authors/practitioners/talks, one for related primary literature. The coordinator independently checked decisive primary passages. The [external ledger](EXTERNAL-SOURCES.md) separates publication date, retrieval date, source type, access depth and evidentiary limit.

### 5.1 What EGM-specific material supports

- **Google launch post [E1]:** establishes authors’ intended mental model and reported adoption. Thousands of daily users is not a controlled quality/cost result. Its claim that fresh reviewers share no blind spots is too strong; shared models and source errors remain. Its simplified narrative must not replace the five-stage pinned skill.
- **Dave Rensin’s essay [E2]:** useful author perspective on design-centered engineering and experience with the technique. It is not a comparative trial. Only the retrieved portion was inspected; an anecdotal usefulness percentage surfaced in search but is deliberately not promoted into a measured result here.
- **AI LABS video transcript excerpt [E3]:** contains a practical claim of finding a real application bug. No reproducible comparator/diff was inspected, and no timestamps were returned in the excerpt. This is a demonstration lead, not validated benchmark evidence; we did not claim to have listened to a podcast or watched the full video.
- **Elise Ewing talk listing [E4]:** establishes a scheduled talk and theme, not what a completed talk proved.

The bounded search did not yield an attributable critical hands-on EGM failure study or a verified podcast transcript. That is a coverage limitation, not evidence that criticism or podcasts do not exist. Generic SEO summaries were not treated as independent corroboration of the launch post.

### 5.2 Adjacent research supports a conditional, not universal, claim

**Self-Refine [E5]** shows that iterative model feedback can improve outputs on selected tasks. **Intrinsic self-correction research [E6]** shows that asking a model to revisit reasoning without external feedback can fail or worsen answers. They are not contradictory universal laws: task, feedback information, evaluation and prompting differ. EGM adds source evidence and distinct roles, but that addition must be tested rather than assumed sufficient.

**Lost in the Middle [E7]** demonstrates positional weaknesses in long-context retrieval tasks. It motivates careful context selection, not a universal token threshold or proof that shorter is always better. A tiny packet missing the decisive contract can be worse than a longer grounded packet.

**Multiagent Debate [E8]** reports gains on its studied reasoning/factual tasks. **Talk Isn’t Always Cheap [E9]** and **Correlated Errors [E10]** provide counterweight to treating more agents/communication as automatically valuable or independent. These are related mechanisms, not EGM evaluations or direct evidence for this exact Sol/Grok arrangement.

**Cross-Context Review [E11]** is unusually relevant but must be read in its updated form. It uses injected errors in a small mixed-artifact set and compares fresh review, context-aware subagents, single same-session review and repeated same-session review. Its updated abstract reports an advantage over repeated same-session review, but **not a statistically significant averaged advantage over the single-review or context-aware-subagent conditions**. One unverifiable run was excluded; the remaining records also lack raw-model-output verification. The paper acknowledges a language difference (Korean versus English), heuristic matching without threshold-sensitivity analysis, one model, synthetic errors and no quantitative human baseline. The matcher may favor a different language than the model does, so even the confound’s direction is uncertain. It therefore does not establish “fresh always wins.”

**Stephens’s preregistered replay [E12]** explicitly pairs cross-family review with fresh same-family controls at different pipeline checkpoints. Its reported results suggest placement of a second look can matter more than switching families. It also reports original reviewers had raised defects the author declined. Limitations: one pipeline, historical selected work, known escaped defects, constrained read-only replay, one session per cell, a late-added comparison arm, and Claude-based grading even though Claude is a compared family. Arm labels were blinded, but writing style could reveal identity; per-finding private evidence is withheld. A fresh-arm review-skill-version change also confounds one comparison. It is not an independent EGM or Ultimate trial. The useful lesson is experimental design: control freshness separately from model family, and audit dispositions as well as catches.

**Synthesis:** the evidence supports testing fresh, source-grounded review and protecting evidence-based resolution. It does not justify a numeric productivity gain, a minimum universal swarm size, or claiming that the port is superior because it has better-looking orchestration.

## 6. Ultimate’s design and real draft

### 6.1 Compare the strengthened proposal, not its rejected predecessor

The earlier `29a37e2a` proposal—two readers and one recheck—was judged underpowered. The comparison here uses **3b1d5b19**, with obligations O1–O8 and fresh final readiness. [P-DESIGN, P-REVIEW]

Its intended flow is:

1. **Author reconciliation:** bind request, predecessor, actual source and authority; catch scope drift before asking others to critique it.
2. **Fresh intent + independent technical critique:** full paraphrases, necessity/reuse, and source-grounded contract/failure review.
3. **Evidence dispositions:** preserve findings, original severity and scope; fix, contest, escalate, decline nits, or explicitly accept risk under real authority.
4. **Affected-claim fresh repair review:** invalidate only coverage affected by meaningful change, but verify repairs rather than trusting edits.
5. **Post-fix zoom-out:** check that criticism did not create unjustified complexity.
6. **Fresh final readiness:** a new reader checks the actual final worker briefs, file actions, current contracts, dependencies and verification.
7. **Normal build/integration/final review:** design readiness is not code approval, user go, a passing test or permission to land.

The source’s exact obligation mapping is **O1 author reconciliation; O2 intent/paraphrases; O3 independent technical/domain coverage; O4 named claims and actual read/missing-source coverage; O5 evidenced dispositions; O6 fresh affected-claim repair and simplicity; O7 new final readiness; O8 authorized implementation/integration/final review**. O4 is important: a clean-looking finding list without evidence coverage does not discharge the review.

Allocation is not always parallel I+C: if framing is fundamentally unsettled, I goes first and C waits for repair. A concept-feasibility assessment may stop after I+C with **readiness pending**. An unchanged previously reviewed packet/brief can reuse explicit provenance rather than relaunch to hit a quota. The recipe permits at most three concurrent readers, sequentializing additional domain lenses; this is a concurrency bound, not a total-review cap.

The policy selects four supporting profiles, all Sol/high: `design-intent`, `design-critic`, `design-readiness`, and a conditional `design-domain`. There is no new authority dispatcher, persisted workflow engine or reset hook. It reuses messages, goal decisions, plan/todo artifacts, subagent reporting and watchdog mechanics.

### 6.2 What is kept, compressed and lost

| Upstream mechanism                   | Ultimate mapping                          | Consequence                                                                        |
| ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Comprehension                        | Intent profile, two full paraphrases      | Preserves the central interpretation test                                          |
| Initial zoom-out                     | Intent/framing rubric                     | Saves a separate stage, but combines naive interpretation with evaluative critique |
| Design critic                        | Independent critic                        | Preserves technical challenge; depends on domain coverage honesty                  |
| Readiness + codebase details         | Fresh readiness profile                   | Focuses on final briefs/current source; merges two independent specialists         |
| Intermediate zoom-out                | Post-fix obligation, including readiness  | Preserves a check, but can overload the readiness reader                           |
| Structural + style                   | Lightweight shared rubric                 | Reduces cosmetic ceremony; less independent documentation review                   |
| Optional domain specialization       | Named hazard-specific reader              | Adaptive focus, not proof of actual expertise                                      |
| Synthesizer                          | Coordinator maintains evidence record     | Less machinery/context hop; more coordinator load and compression responsibility   |
| Brainstorm/draft/review/loop/resolve | One local checkpoint recipe and templates | Five skills adapted, not five verbatim commands                                    |
| Bootstrap + drift report             | Deferred                                  | No equivalent automatic contract-tree creation or systematic living-spec scan      |

Seven personas reduced to four profiles does **not** preserve the same sampling distribution. Combining lenses may save time or cause interference: an intent reader can become so focused on YAGNI that it fails to describe the document neutrally; a readiness reader can miss an interface mismatch while checking ownership and simplicity. The port must measure these losses, not relabel them “more efficient” by definition.

### 6.3 What the actual draft contains

Commit **906a10a0** contains one skill, four profiles, four references/templates, two overlay fragments, README, upstream attribution and Apache license: **14 files, +1,132 lines**. This is a portable resource bundle with an installation/rollback recipe, not activated configuration. It uses normal existing tools and declares its prompt-only limitations. [D-resource]

The rule set explicitly preserves fresh paraphrases, stable IDs, original severity, missing coverage, same-pin source expansion, neutral repair inputs, and independent final briefs. It forbids author chat, memory, inbox, database, auth/secret access, writes/builds/tests/source execution **by instruction**. Profiles expose `read` and **`bash`**, `isolate: none`, `summaries: false`.

This is a material weakness relative to Google’s Claude reviewer adapters: shell access can read excluded stores, execute source or mutate files. A rule saying not to is not mechanical tool withholding. Conversely, Google’s Read/Grep/Glob restriction is not proof that every readable path is confined. Both distinctions must remain visible.

### 6.4 What the prior plan review actually established

The strengthened plan includes **17 paper scenarios** and actual independent critique/readiness of the plan. The scenario outcomes are deliberately supplied inputs and expected transitions, not seventeen successful model executions. REVIEW-3 records nine critique/readiness items (seven initial, including overlapping coupling reports, and two readiness items). [P-DRY, P-REVIEW]

The strongest concrete lesson was a **bad worker split**. The medium historical typed-input feature initially allocated three apparently disjoint workers. Source inspection showed shared type constructors, provenance server action and UI consumers could not form the promised independently buildable predecessor. The final outline correctly chooses **one atomic owner**, preserves the historical before-image UI rather than importing a later UI architecture, and names relevant accounting tests. This is evidence that independent scrutiny improved this plan; it is not yet evidence that the future packaged recipe will reliably do the same.

The high-risk native-task example requires backend/shared contract first, then a UI consumer on that verified baseline. It also separates fake runner tests from actual durable-call replay proof. A passing direct runner test does not prove an interrupted unsafe tool call will not be resent. A missing provider/history/replay contract stops work rather than commissioning a more confident reviewer. [P-examples]

### 6.5 Verification status at the freeze

The implementation coordinator supplied recorded locations for:

- `parseDefinition` on all four profiles, license equality: **#21909/25239**.
- Existing affected subagent/skills/families suites: **51/51**, **#21909/25273**.
- Clean-environment project check: **#21909/25223**.

These are **recorded implementation-run evidence**, not this report pretending to have independently rerun the full draft. The coordinator inspected the actual tool outputs at #21909/25223 (project checks), #21909/25239 (four parsed definitions and license equality), and #21909/25273 (51 tests), rather than relying only on the implementation coordinator’s prose. They establish different things from a live workflow trial. Pending at the frozen draft were an actual disposable resource-loader/faux-harness fixture, four wording clarifications, temporary-input cleanup, final immutable-range review and real feature/small-fix rollout. No installed activation or measured usefulness was established.

The four known wording issues in **906a** are substantive: disallow live probes for the domain reader despite a conflicting exception; route sidechat evidence through main authority; require affected tests as well as project check; and clarify that forbidden “history” means author-conversation history, not necessary same-pin Git inspection.

**Later inspected follow-up, kept separate from the frozen comparison:** while this report was being written, implementation coordinator #21909 supplied **`b1f47fcc0030e9f399ee92614fa1821456e45a0a`**. Its resource diff from906a changes8 files (+63/−46) and resolves those four wording issues: D never probes, an authorized evidence worker P is separately routed; main records applicable decisions; coordinator runs affected tests; pinned Git source reads are explicitly allowed. I inspected that diff. The coordinator reports a green project check, but the Grok job timed out before creating the loader fixture. **At that follow-up, actual loader proof, final resource review, rollout and usefulness remained pending.** This wording repair does not remove bash or turn prompt rules into a sandbox. The recommendations below account for the follow-up rather than falsely reporting already-fixed wording as still absent.

**Later loader-only evidence, not a new comparison baseline:** under the user’s explicit Sol 6.1 implementation trial, #21909 ran disposable fixture A on `db5926353942a60a2cb7238172e07d17daf5b30a` (the implementation branch’s normal merge of the unrelated `688b2888` host update). I inspected its source and actual output at **#21909/30428: one test passed, 59 ms**. It exercises real `discoverAgents`, `projectSkills` and `expandSkillCommand` with declined project trust: four personal Sol/high/read+bash profiles, resolved model metadata, appended existing overlay snapshots, personal skill expansion, excluded project overrides, local links/no symlinks and an unchanged unrelated file. Its preserved source SHA-256 is `331d74f3817c737925d827c7d1cdbd9f2d247562f0a382a9fd706d3593dca89d`. No resource change or installed activation followed. This is actual loader evidence, not merely parsing, but the research coordinator did not rerun it; it does **not** start a fresh child, invoke a model, prove context isolation/capability behavior, or measure workflow usefulness. Those lifecycle/live-workflow and final-review obligations remain open. The comparison pins above remain unchanged.

**Current-overlay refresh and faux-child fixture B:** the implementation coordinator then refreshed A against the current personal overlay snapshots, preserving the explicit Sol implementation trial and new **Dream request preflight**, rather than certifying only the earlier Grok-only/Dream-handoff snapshot. I inspected the fixture diff, B’s source patch and actual output **#21909/31296: A passed in 37 ms; B passed in 98 ms; 2 selected tests passed, 46 unrelated tests filtered out**. A’s refreshed source hash is `6e943b62f5157d428953a121aac658247b65c0720b56bb9f40cadd69e9ba2056`; B’s preserved patch hash is `3e0af4705ccd25da73fef519bb2346d01ae9e8d6882fb78afd9e1865247ac995`.

B starts the discovered personal intent reader through the actual subagent path with `fork:false`, checks read/bash tools, reads the pinned source and rules, and verifies that author-history/prior-verdict canaries are absent while an inherited system canary remains. Its returned identity is honestly **`faux/faux-1`**, not live Sol. An initial assertion incorrectly expected the codemode extension itself to be absent and failed (#21909/31243); the corrected fixture distinguishes the retained extension from the unexposed codemode tool. This observation reinforces the report’s inherited-context/capability caveat; it is not an isolation guarantee. These are selected-registry mechanics under scripted faux responses, not a live model’s choice to follow the recipe, a full-host audit or measured effectiveness. Final resource review, actual rollout and usefulness remain open. Neither fixture changes the frozen source comparison or removes bash.

## 7. Side-by-side comparison

**Status labels:** S = source-supported difference; H = hypothesized outcome; U = unproved in this workflow.

| Dimension             | Google EGM, pinned                                                                                           | Ultimate strengthened design/draft                            | Verdict and status                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Core idea             | Continuing author + fresh artifact/source readers                                                            | Same information split                                        | Shared principle, not a port innovation (S)                                |
| Framing               | Dedicated initial zoom-out                                                                                   | Combined intent/framing                                       | Lower ceremony versus attention interference (S/H)                         |
| Meaning test          | Two full paraphrases retained                                                                                | Same required output                                          | Good preservation; compliance still U                                      |
| Technical coverage    | Available distinct critic, codebase, readiness, style/structure lenses; dispatch/iteration depends on preset | Critic + combined readiness + conditional domain              | Fewer independent samples; domain targeting may help or miss hazards (S/H) |
| Final target          | Detailed implementation section and real code                                                                | Exact worker briefs, source pin and ownership                 | Better local fit is H; upstream already has source-grounded readiness (S)  |
| Repair                | Fresh rounds, two clean, cap/churn decisions; preset differences                                             | Obligation-driven fresh checks and final R                    | More adaptive, less repeatable; neither is correctness proof (S/H)         |
| Overengineering       | Dedicated post-critic zoom-out                                                                               | Explicit post-fix simplicity obligation                       | Preserves intent with less independent attention (S/H)                     |
| Authority             | Repeated human section/architecture checkpoints                                                              | Existing user/goal authority, no redundant go                 | Fits authorized autonomy; weaker if authority reconstruction fails (S/H)   |
| Tool limits           | Claude reviewer Read/Grep/Glob; host-specific                                                                | Read/bash; read-only instructions; no sandbox                 | **Potential capability regression**, not cosmetic (S)                      |
| Freshness             | Native fresh child; adapter/config matters                                                                   | `fork:false`, inherited project/extension context             | Neither equals inaccessible history/source stores (S)                      |
| Model diversity       | Host/inherited model, optional samples                                                                       | Four Sol profiles; normal coding/final-review policy remains  | Role names do not guarantee independent errors (S/U)                       |
| Context rebuilding    | Bootstrap contracts and drift workflow                                                                       | Existing source/memory practices; those skills deferred       | Upstream stronger for underdocumented repos (S/H)                          |
| Findings transport    | Optional artifact-first synthesizer                                                                          | Coordinator/existing reporter and review record               | Less layering, greater coordinator context burden (S/H)                    |
| Lifecycle integration | Host-agnostic instructions/adapters                                                                          | Local Stop/watchdog/ownership/source rules                    | Potentially better seam handling, mostly prompt compliance (S/H)           |
| Small fixes           | Ordinary workflow recommended                                                                                | Explicit zero-reader path                                     | Same good exception; classify risk not diff size (S)                       |
| Tests                 | 138 offline checks passed here; live fixtures exist                                                          | Recorded tests/parse inspected; actual recipe rollout pending | Neither proves comparative effectiveness (S/U)                             |
| Adoption/usefulness   | Google-reported adoption, anecdotes, harness records                                                         | Paper scenarios and staged draft                              | No evidence ours already wins (U)                                          |

**Where ours could win:** an authorized medium/high-risk Ultimate feature where failure is in source-version mismatch, durable lifecycle semantics or an unbuildable handoff, and where the coordinator faithfully binds actual briefs and evidence. **Where upstream could win:** unfamiliar/poorly documented repositories, human-led architecture workshops, documentation quality as a primary deliverable, or hosts where restrictive reviewer adapters are available and the local shell profile is unacceptable.

**Where neither is warranted:** a small clear correction with no unresolved behavioral/authority question. Ordinary inspection and the relevant test may dominate a design panel.

## 8. Authority and runtime boundary audit

Runtime citations below refer to **1475c80e**, not the older source in historical plan fixtures. Local lookup form: `git show <pin>:<path>`. The table distinguishes existing mechanics from the checkpoint’s unenforced obligations.

| Boundary                         | Existing source/mechanic                                                                                 | Remaining obligation or failure                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fresh versus forked child        | `extensions/subagents/children.ts` creates a new conversation unless explicit fork                       | `fork:false` does not erase inherited AGENTS/personal/extension prompt sections or restrict filesystem access               |
| Source identity/digest           | Git objects can name exact bytes; packet records them                                                    | Coordinator must actually read/compare; a hash proves identity, not truthful content or completed review                    |
| Effective model                  | `lib/families.ts`, `lib/agents.ts`: explicit model selection, overlay resolution, fallback/preview paths | Validate resolved and returned model; missing-login fallback and later overlays can invalidate a frontmatter-only claim     |
| Normal subagent start            | Start records owner anchor/index, reporter and request identity                                          | Low-level create-child alone is not equivalent to the full owned workflow                                                   |
| Parent Stop                      | Existing subagent contract: children continue unless explicitly stopped                                  | Recipe must stop captured children; no new automatic cascade exists                                                         |
| Captured Stop replay             | Stop binds run/input/reporter/watchdog identities                                                        | Old Stop must not kill a later reuse; keep actual receipts, not just child number                                           |
| Replacement fork                 | Child actions require ownership index                                                                    | New owner cannot cancel old owner’s children by guessed/captured IDs; main must coordinate original owner or remain blocked |
| Watchdog recovery                | Existing failure/retry machinery owns recovery                                                           | Do not spawn a duplicate while retry is pending; continuation is not a new independent reader                               |
| Empty/failed result              | Reporter can label failure                                                                               | Failure, absent coverage, wrong target/model or stopped result must never count as zero findings                            |
| Late answer after revision/reset | Durable history/report delivery can retain answers                                                       | Recheck packet/source/authority applicability; history visibility is not current readiness                                  |
| Compaction                       | Condenses context, retains durable history                                                               | Reconstruct exact obligations/decisions, not an optimistic abstract                                                         |
| Reset                            | Invalidates current applicability, not external effects by magic                                         | Explicitly stop owned work and reestablish authority before resuming; no checkpoint reset hook                              |
| Sidechat                         | `extensions/side-chat/server.ts`: tracked effects lock Discard before execution                          | Discard is not rollback; explicit tracker is not universal shell-effect detection; endorsement is not user go               |
| Questions                        | `extensions/questions/server.ts`: answer/dismiss user-only and open-message validation                   | Open question is not proof it still authorizes the latest design; bind scope and actual answer entry                        |
| Messages                         | Existing one-way send/delivery semantics                                                                 | An agent message carrying “approved” does not become an originating user decision                                           |
| Hands-off goal                   | Existing goal decision path can act within delegated scope                                               | Cannot invent missing contracts or expand secrets/login/force/billing authority                                             |
| Unknown native/provider contract | A source/readiness gap can be named                                                                      | More reviewers do not establish a missing API, remote cancellation guarantee or safe replay behavior                        |
| Worker ownership                 | Disjoint paths can still share types/schema and runtime transitions                                      | Verify buildable predecessor; use atomic ownership when necessary                                                           |

A model handoff adds **semantic drift** even when delivery is durable: an author means one contract, a Sol reader paraphrases another, a coding model interprets a concise brief differently. Exact source pinning removes version ambiguity, not meaning ambiguity. Full paraphrases and concrete acceptance tests address different parts of that problem.

The selected capability canary in the plan proves only the selected registry/configuration tested. It is not whole-host proof that every extension, personal instruction or accessible tool obeys the reviewer boundary. Likewise, a faux harness proves registration/task mechanics under its fixture; it cannot prove a live model’s judgment or obedience.

## 9. Cost, allocation, and small-fix exceptions

### 9.1 Count launches, generations, waves and workers separately

Upstream’s Codex workflow fixture requires at least 15 completed native children for its tested brainstorm/draft/review path: six brainstorm children plus nine review-stage instances. This is not 15 personas, a universal invocation count, or the cost of every preset. Optional A/B, iterative repairs, nesting and failures change it. [U-integration]

The strengthened Ultimate paper cases are explicit [P-DRY]:

| Case                                     | Reader allocation                                                            | Conditional implementation allocation                            |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Small known wording fix                  | 0 readers / 0 waves                                                          | No delegated worker needed                                       |
| Clean medium feature                     | I + C, then fresh R: **3 readers / 2 waves**                                 | **1 atomic worker** for the coupled typed-input case             |
| Medium with intent and readiness repairs | I1+C1 → I2 → R1 → R2: **5 / 4**                                              | Same atomic owner; repairs do not justify artificial parallelism |
| High-risk native boundary                | I+C+D, then R1, R2: **5 review readers / 3 waves**, plus one evidence worker | Backend/shared contract first, UI second on inspected baseline   |
| Unknown/unapproved provider expansion    | 0 if caught by author reconciliation                                         | Blocked; no worker                                               |
| Provider retry on same child             | 3 unique readers, at least 4 generations                                     | Retry is not a fourth independent reader                         |
| Two repairs fail same obligation         | 4 readers / 3 waves in supplied example                                      | Stop/reassess, not automatic R3                                  |

These are policy demonstrations, not measured token/latency totals. They do not mean “always use three workers” or “never more than three reviewers.” Three fresh reader launches are the minimum clean-feature path; meaningful repairs and distinct material hazards need more. The small-fix path is deliberately zero.

### 9.2 A useful cost model without invented numbers

Total token/tool cost includes repeated packet/source reads, inherited prompts, reviewer reasoning/output, synthesis, author triage, repairs, retries and final implementation review. Parallel waves reduce elapsed time only where work is independent; they do not eliminate duplicated context cost. Critical-path latency is approximately the sum of the slowest required task in each dependent wave plus author/user waits—not simply the longest single reviewer call.

A larger packet can improve grounding while increasing context load and exposure to irrelevant persuasive material. A smaller model can cheaply gather sources, but source extraction errors must not silently become architecture judgments. Repeated same-model roles may have low marginal recall. Cross-model review can add cost without improving the relevant defect class. Measure these terms rather than claiming a percentage saving from fewer named personas.

Review is economically justified when avoided downstream harm/rework exceeds review, false-positive repair and delay costs. Consequence and uncertainty matter more than lines changed: a one-line permission or replay change may need a domain check; a many-line mechanical rename may not need a design panel.

## 10. Repairs and a falsifiable evaluation

### 10.1 Minimal recommendations before activation

These are recommendations from this report, **not product changes made here**.

1. **Retain and verify the four follow-up clarifications.** The inspected b1f47fcc diff fixes906a’s probe/sidechat/test/history wording. Verify those exact bytes in the real loader and final reviewed resource range; do not certify a different or earlier installed copy.
2. **Make the capability regression an explicit decision.** If trusted read/bash is retained, describe it honestly and test selected access boundaries; do not market it as restrictive isolation. Consider a truly read/search-only capability only as a separately scoped change, not a new framework smuggled into this research.
3. **Verify real discovery and effective configuration.** The later A/B fixtures use actual overlay/profile/skill discovery and a faux fresh-child path, not parser-only success. Preserve this evidence for the exact delivery bytes and recheck affected configuration if it changes. Their model/tool/context/resource-read/returned-identity checks do not substitute for the actual host’s capability decision or a live workflow trial.
4. **Keep source/authority/readiness receipts together in existing artifacts.** Avoid new dispatch machinery. A later source or brief change must invalidate the affected claim; a late old answer remains historical.
5. **Preserve whole-final-brief inspection.** Neutral changed-claim lists are helpful but cannot replace tracing constructors/callers, task dependencies and the final integrated source state.
6. **Run a real feature and zero-reader control before broader adoption.** A loader pass and 17 paper cases do not prove the workflow is useful. If it produces low-value ceremony, simplify rather than institutionalize it.

### 10.2 A head-to-head experiment that can actually disprove superiority

Use three arms: **ordinary Ultimate**, **pinned EGM with an explicitly named preset**, and **the strengthened adaptation**. Optional ablations can isolate final-brief readiness or specialist sampling, but do not start with an expensive factorial swarm.

**Population:** representative small clear fixes, medium coupled cross-extension changes, and high-risk durability/authorization/model-boundary features. Include historical before-images with known defects and clean controls, then prospective eligible work. Do not select only cases built to flatter the port.

**Controls:** same request, source revision, accessible evidence, author opportunity and total model/tool budget where feasible. Record exceptions. To separate workflow from model effects, keep model configuration matched in the primary comparison; study cross-family diversity separately. Prevent later fixes or reviewer verdicts leaking into replay repositories. Verify actual session/model envelopes and source reads, not just requested settings. Randomize/order-balance arms and blind defect adjudicators to the arm when practicable. Human intent should be available as neutral ground truth, not author persuasion.

**Measure:**

- Valid defect recall by severity and class; distinct discoveries, not duplicate comment count.
- Precision/false positives, including needless mitigation induced by review.
- Rejected true findings and accepted unsupported claims, not only detection.
- Repair success, regressions, churn and residual missing coverage.
- Brief-only omissions: wrong source baseline, imaginary API, wrong file action, unbuildable ownership, omitted recovery/test contract.
- Total elapsed time, critical-path waves, tool calls, input/output tokens, generations/retries and user decision turns.
- Implementation rework, integration/merge failures and escaped defects after normal final review.
- Small-fix ceremony and any authority/capability violation.

**Proposed decision rules, not results:** pre-register a non-inferiority requirement on serious defect escape and no tolerated authority/capability violations in the selected probes; require an observable reduction in validated handoff defects or total rework at an acceptable agreed cost. Report uncertainty and per-class results. A small pilot can reject a bad workflow but cannot establish rare-event safety. Do not invent a percentage improvement or call a statistically uncertain tie a win.

Useful causal ablations are: fresh versus same-session review with the same packet; paraphrase retained versus findings-only; final briefs versus design-only readiness; evidence-disposition audit versus author discretion; four combined profiles versus equivalent-budget specialist lenses. These test the proposed keys rather than rewarding the number of agents launched.

## 11. Coverage, checks, and unknowns

### 11.1 Repository coverage is explicit, not a claim of omniscience

[UPSTREAM-COVERAGE.csv](UPSTREAM-COVERAGE.csv) has **one row for each of 225 tracked paths**, a SHA-256, coverage classification and reason/canonical mapping. Canonical skills, reviewer prompts, standards, templates, scenarios, host contracts, tests and packaging logic were audited. Generated distribution duplicates are byte-compared, not counted as independent mechanisms. Supporting design narratives were cross-checked selectively; site/admin/assets are indexed with explicit exclusions from reasoning-mechanism analysis. This does not pretend every screenshot, font or release UI deserves a line-by-line architectural review.

All seven scenario files contain **30 scenarios** total. Several assertions are broad text patterns—mentioning “review” or “drift” can satisfy a described check. The offline suite validates their structure, not the model’s execution of them. Even a future runner passing those patterns would not establish semantic recall/precision.

### 11.2 Checks actually executed here

- Google source and old-pin diff inspected; 225-path inventory created.
- `scripts/pack_plugin.py --target claude`: generated distribution **byte-equal** to committed `distributions/claude`; source checkout clean.
- Inspected `requirements-dev.txt`, pytest config, shared fixtures, unit imports, packaging scripts and integration modules’ imported helpers before execution.
- With explicit authorization, created a disposable venv with empty HOME/environment, public PyPI only, `PIP_CONFIG_FILE=/dev/null`, owned cache/temp. Installed declared `pytest>=7.4.0`, `pyyaml>=6.0.1` plus dependencies; no global/repository dependency changes.
- Resolved versions: **pytest9.2.0, PyYAML6.0.3, iniconfig2.3.1, packaging26.3, pluggy1.7.0, Pygments2.21.0**.
- Ran explicit offline unit suite, plugin autoload disabled: **138 passed in 1.92s; zero failures/skips**.

Reproduction shape (replace owned temporary paths):

```sh
env -i HOME="$OWNED/home" PATH=/usr/bin:/bin TMPDIR="$OWNED/tmp" \
  PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 "$OWNED/venv/bin/python" -m pytest \
  -c "$EGM/pyproject.toml" "$EGM/tests/unit" \
  --basetemp="$OWNED/tests" -o cache_dir="$OWNED/pytest-cache" \
  -o addopts=--import-mode=importlib -ra -q
```

Earlier attempts using the ordinary Python shim failed; explicit Python then lacked pytest. The isolated run resolved that dependency limitation. Live Claude/Codex integration tests were **not collected or enabled**: they require installed/authenticated CLIs and real model activity. Unit tests exercise their trace parsers with fabricated traces. Thus 138 passing tests establish packaging/schema/link/metadata/trace-contract behavior, **not fresh-review efficacy or this port’s live compliance**. Upstream TESTING’s live harness records remain attributed upstream observations.

### 11.3 Unknowns that affect the verdict

| Unknown                     | Why it matters                                        | Cheapest credible next evidence                                                     |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Real port compliance        | Prompt obligations may be ignored                     | Use bounded loader/faux evidence; then one real feature                             |
| Effective independence      | Shared source/model/instructions may correlate errors | Matched fresh controls and inspected context/source receipts                        |
| Tool boundary acceptability | Bash can violate read-only intent                     | Explicit capability decision and bounded selected tests; no universal sandbox claim |
| Comparative usefulness      | Fewer roles could save cost or miss defects           | Matched-budget comparison with precision, recall, rework and time                   |
| Long-term drift             | Copied prompts/docs can disagree                      | Pin-aware maintenance review, not blind upstream sync                               |
| Rare lifecycle failures     | Paper examples do not execute race/replay paths       | Existing focused runtime tests plus representative actual recipe exercise           |
| External generalization     | Related papers use different tasks/models             | Treat literature as hypotheses; test this repository/workflow                       |
| Human experience            | Too many gates or artifacts can slow decisions        | Count user turns, abandonment and time to an actionable brief                       |

**Bottom line:** the port’s strongest bet is not “more clever reviewers.” It is **better preservation of meaning, evidence, source identity and executable ownership across handoffs**. That bet is sensible, locally motivated and still unproved. Google’s upstream is broader, more explicit about several independent lenses, and stronger on reviewer tool withholding in its Claude adapter. A truthful implementation should preserve those strengths where needed and admit its losses—not sell integration as demonstrated superiority.

## Source index

Upstream citations below resolve to immutable source. A citation to a directory means the named files/lenses described in the adjacent text; coverage hashes are in the CSV. Internal proposal/draft citations are locally reproducible Git objects, whether or not separately published. No private host paths or account identifiers are needed.

- **[U-manifest]** [plugin.json](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/plugin.json).
- **[U-brainstorm]** [egm-brainstorm](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/skills/egm-brainstorm/SKILL.md), Steps 1–4.
- **[U-draft]** [egm-draft](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/skills/egm-draft/SKILL.md), predecessor intake and finalization; `resources/execution_instructions.md`.
- **[U-review]** [egm-review](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/skills/egm-review/SKILL.md), presets, semantic split, stages 5–9.
- **[U-loop]** [egm-review-loop](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/skills/egm-review-loop/SKILL.md), target resolution, statuses, convergence/churn.
- **[U-resolve]** [egm-resolve](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/skills/egm-resolve/SKILL.md), categories, resolution gate and final handoff.
- **[U-comprehension]** [comprehension persona](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/agents/comprehension.md).
- **[U-synth]** [synthesizer persona](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/agents/synthesizer.md), REVIEW/BRAINSTORM branches.
- **[U-agents]** [canonical agents](https://github.com/google/elephant-goldfish-model/tree/5efe34126a0059eff51ca7e0af7e3249d70952bf/agents).
- **[U-standards]** [five standards](https://github.com/google/elephant-goldfish-model/tree/5efe34126a0059eff51ca7e0af7e3249d70952bf/resources/document_standards).
- **[U-bootstrap]** [egm-bootstrap](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/skills/egm-bootstrap/SKILL.md), Steps 0–5 and references; `agents/bootstrap_orchestrator.md`.
- **[U-drift]** [egm-drift-report](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/skills/egm-drift-report/SKILL.md).
- **[U-harness]** [harnesses](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/docs/harnesses.md).
- **[U-claude]** [Claude guide](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/docs/claude.md), `.claude-plugin/agents/*.md`.
- **[U-codex]** [Codex guide](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/docs/codex.md).
- **[U-privacy]** [data handling](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/docs/privacy.md).
- **[U-pack]** [packager](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/scripts/pack_plugin.py), `prepare_release.py`.
- **[U-unit]** [unit tests](https://github.com/google/elephant-goldfish-model/tree/5efe34126a0059eff51ca7e0af7e3249d70952bf/tests/unit), especially `test_harnesses.py`, `test_claude_traces.py`, `test_scenario_coverage.py`, `test_packaging.py`.
- **[U-integration]** [integration tests](https://github.com/google/elephant-goldfish-model/tree/5efe34126a0059eff51ca7e0af7e3249d70952bf/tests/integration), `test_claude.py`, `test_codex.py`; [TESTING](https://github.com/google/elephant-goldfish-model/blob/5efe34126a0059eff51ca7e0af7e3249d70952bf/TESTING.md).
- **[P-DESIGN]** `3b1d5b19:docs/designs/elephant-goldfish/{DESIGN,PORT-MAP,SEAMS}.md`.
- **[P-DRY]** `3b1d5b19:docs/designs/elephant-goldfish/DRY-RUNS.md`, §§2–5; 17 supplied paper cases.
- **[P-REVIEW]** `3b1d5b19:docs/designs/elephant-goldfish/REVIEW-3.md` and earlier `REVIEW.md`.
- **[P-examples]** `3b1d5b19:docs/designs/elephant-goldfish/examples/{typed-inputs-v1,typed-inputs-v2,typed-inputs-handoff,typed-inputs-handoff-final,cursor-independent-handoff}.md`.
- **[D-resource]** `906a10a0:.ultimate/resources/design-checkpoint/`; separately inspected follow-up `b1f47fcc0030e9f399ee92614fa1821456e45a0a` changes eight resource files as described in §6.5; four `agents/*.md`, `skills/design-checkpoint/SKILL.md`, `references/{review-rules,review-record,design-template,handoff-template}.md`, overlays and README.
- **[R-runtime]** `1475c80e:{lib/agents.ts,lib/families.ts,extensions/subagents/children.ts,extensions/subagents/server.ts,extensions/questions/server.ts,extensions/messages/api.ts,extensions/side-chat/server.ts}`; relevant functions/behaviors are named in §8.
- **[E1–E12]** Exact URLs, dates, authors, excerpts and access limits in [EXTERNAL-SOURCES.md](EXTERNAL-SOURCES.md).
