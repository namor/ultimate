# Provenance

Adapted from [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model)
at pin `f0ba151b252c9abf1318d9fe857a43265d06de89` (Apache-2.0). Original copyright:
Google LLC. No Google endorsement or support is claimed. No `NOTICE` file exists
at this pin. License text: [LICENSE](LICENSE).

This is **not** EGM, not plugin-compatible, and not a runtime engine. Local
behavior uses Ultimate's coordinator, `subagent`, plan ledger, messages/questions
and goal records.

## Pin and keep

| Upstream path | Decision             | Here               |
| ------------- | -------------------- | ------------------ |
| `LICENSE`     | KEEP, byte-identical | [LICENSE](LICENSE) |

## Adapted sources (selected behavior, not drop-in files)

| Upstream path                                                      | Folded into                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `skills/egm-brainstorm/SKILL.md`                                   | [SKILL.md](SKILL.md) framing/reuse                             |
| `skills/egm-draft/SKILL.md`                                        | SKILL.md + [design-template.md](references/design-template.md) |
| `skills/egm-draft/references/design_doc.md`                        | design-template.md                                             |
| `skills/egm-resolve/SKILL.md`                                      | SKILL.md + [review-rules.md](references/review-rules.md)       |
| `skills/egm-review/SKILL.md`                                       | SKILL.md + four `design-*` profiles                            |
| `skills/egm-review-loop/SKILL.md`                                  | SKILL.md obligation/recheck rules                              |
| `agents/comprehension.md`, `agents/zoom_out.md`                    | `agents/design-intent.md`                                      |
| `agents/design_critic.md`                                          | `agents/design-critic.md`; scoped domain                       |
| `agents/implementation_readiness.md`, `agents/codebase_details.md` | `agents/design-readiness.md`                                   |
| `agents/structural.md`, `agents/style.md`                          | Lightweight checks in review-rules                             |
| `resources/document_standards/*-standard.md`                       | review-rules.md                                                |
| `resources/execution_instructions.md`                              | SKILL.md design-only-until-go                                  |
| `resources/README.md`                                              | This mapping                                                   |

TEST/scenario files from the five selected skills informed compact examples in
[review-record.md](references/review-record.md) and
[handoff-template.md](references/handoff-template.md); they are not installed tests.

## Deferred / omitted (do not install)

Deferred: bootstrap skill/personas/templates/schema; drift-report.
Omitted: synthesizer, plugin/harness metadata, icons, website, Python toolchain,
upstream docs as executable authority. No `reviewer-*` names.

Re-check this file if the upstream pin moves. If a later pin adds `NOTICE`, carry
applicable notices.
