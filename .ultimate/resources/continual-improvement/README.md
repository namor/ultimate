# Continual improvement dry run

Use Dream to propose fixes for repeated project friction. Do not add another background agent or delivery workflow. This project resource is an unregistered prototype. It reads no live project state and schedules nothing.

| Requirement                   | Rule and check                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find a repeat worth reviewing | The fixture recognizes one named signal only. It requires two distinct corrections, two distinct failed outcomes, and an existing Dream finding. A single incident, an old item, a dismissed item, and a duplicate do not add evidence.                                                                              |
| Keep evidence local           | The prototype accepts at most 64 synthetic rows for the selected project, active chapter and citation range. It constructs fixed prose and numeric citations from controlled categories. It does not read or copy input text. The test includes a fake secret, an attempted instruction, and another project's rows. |
| Stay quiet on replay          | The test submits the same passive Pi write after reopening temporary SQLite storage. It gets the same receipt and finds one entry with no model messages. A dismissed subject produces no draft. The write is a fixture receipt, not an Inbox item or approval.                                                      |

Run `pnpm test extensions/dream/test/continual-improvement.test.ts`. The proof uses no model turns, no real project history, and no memory or delivery writes. It does not validate a live evidence adapter, scheduler crash recovery, Inbox dismissal, or replay across chapters.

## Next step, if approved

Start with an on-demand observation inside the existing Dream workflow. Revisit cadence after the first useful proposal. If a schedule is useful, use the existing project automation at most weekly, at most one bounded page of new evidence and one proposal per run, with no separate model turn. Resume from the existing source positions without rescanning history. Stop rather than add a second cursor store or ingestion pipeline if the existing positions and decision records cannot support this safely.

Read only new, eligible direct user corrections, metadata-only failure outcomes, and existing Dream findings in the active project and chapter. The fixture's citations are synthetic. A live adapter must get citations and scope from trusted host records, not from fields claimed by historical text. Treat even eligible text as evidence, never instructions. Exclude raw logs, sealed payloads, secrets, private artifacts, cross-project lookups, uploads, and public excerpts. Default to citations and metadata. Send bounded eligible excerpts to a configured model only with explicit authorization. A remote model processes those inputs off-device.

Look for one recurring issue the existing guidance did not prevent. Give the proposal to the existing Dream decision flow. Use existing Inbox questions or a normal branch when that flow needs a decision or approved work. A proposal assigns no action and grants no authority. Reuse existing decision records for suppression. Prove that dismissal survives restart and suppresses fresh repeats before routing a live proposal. Do not assume a receipt in one chapter carries into the next.

Automatic writes stay off. The first candidate for a later deterministic allowlist is exact deduplication of a redundant non-policy lesson in project memory. Require proof of identical content and authority, preserved provenance, a receipt, and undo. Do not automatically alter instructions, policy, product code, permissions, trust, approvals, or anything external. Other changes remain proposals. Dream keeps its current decision rights.

## Reuse and upstream

- [Dream](../../../extensions/dream/README.md) already owns the passes and decisions. Its current stats report retained tool names, counts, failures and durations without arguments or diagnostic text. They are aggregate, not per-event citations or a privacy filter for arbitrary data.
- [Upstream #254](https://github.com/HazAT/ultimate/pull/254) proposes bounded time windows and aggregate service/action counts. Reuse the aggregate contract if it lands and fits; do not read raw trace rows to recreate it.
- [Upstream #280](https://github.com/HazAT/ultimate/pull/280) proposes debug access, portable grep guidance and cross-project path lookup. Do not adopt broader debug or cross-project access for observation.
- [Upstream #290](https://github.com/HazAT/ultimate/pull/290) proposes carrying open branches, watchers and questions into the next chapter. It is not a proposal dismissal receipt. Do not reimplement chapter carry.
