# Execution handoff

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`, draft/readiness sources. Modified
for Ultimate. See [../UPSTREAM.md](../UPSTREAM.md).

R reviews **this** artifact, not “delegate as appropriate”. Bind `designRef` and
`outlineRef`. No build authority is implied by a reviewed outline.

## Task brief

```text
id: W1
outcome: <user-visible result>
files:
  Create: <paths, or none>
  Modify: <paths, or none>
  Delete: <paths, or none>
contracts: behavior / API / errors / recovery   # coordinator-owned
non-goals: <explicit>
predecessor: <inspected commit, or none>
dependsOn: <landed commit of another unit, or none>
acceptance: <binary checks>
CORETEST: <committed core path and/or actual regression; command>
PROVEONCE: <temporary evidence, throwaway test/script/preview; command; delete after>
stop: unplanned behavior/contract → return evidence; do not redesign
status: actionable | blocked | out-of-scope
```

**CORETEST** is a committed test for the core path or a bug that happened.
**PROVEONCE** is temporary evidence (preview, throwaway script) shown in the
report and not kept as product policy. Do not invent a runtime judgment
framework.

Also record: original cleanup owner and replacement-fork Stop receipts if
relevant; integration and reopen conditions.

## Illustrative medium — one atomic worker

At the before-image the old type is constructed, exported and queried together.
Splitting writer vs renderer vs consumers leaves an unbuildable intermediate.
**W1 only**; private edit order is the worker's; return **one** coherent
verified commit.

- **Modify** existing type, delivery server, renderer, and named input-accounting
  consumers (already exist — not Create).
- **Delete** the legacy reconstruction module only in the same patch as its
  callers.
- Preserve current card/section/chip. Do not import a later UI shell.
- Human lookalikes stay human; parent Stop still does not cascade.
- **CORETEST:** focused suites for typed delivery, accounting once, human
  lookalikes, cancel/reopen. **PROVEONCE:** coordinator preview of
  source/return/missing-source. Actual core changes need the project's full
  check suite before final review; no waiver.

Coordinator → W1 → coordinator integration. No inter-worker graph.

## Illustrative high-risk — sequential backend then UI

New extension whose backend folder can load without a web facet. **H-W1** owns
lifecycle, shared types, get/cancel, artifacts; finishes first. **H-W2** owns
presentation/tests after that **verified** commit. Never race types. If the
shared contract changes after H-W2 starts, pause and reopen readiness.

C covers durable interrupt/integration. D covers a **named** native-process /
owner-permission hazard (question + consequence). Error rule: if an earlier
sanitized failure exists and later patch capture fails, **append** the new
reason; do not replace the cause.

A required replay/checkpoint proof that the current harness cannot expose stays
**pending/blocked**, not certified away. No new paid/live/auth probe without
authorization. Native-task evidence does not close an ungranted full-provider
contract.

After go: coordinator inspects the backend commit before releasing UI; focused
checks; then one Astra on immutable `base..head`.
