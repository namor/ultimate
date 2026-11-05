# Execution handoff

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`; modified for Ultimate. See
[../UPSTREAM.md](../UPSTREAM.md).

Write a brief only when delegation helps. Reference the compact contract;
keep these fields in the existing plan instead of copying contracts between
documents. A separate readiness reader is needed only for an unresolved material
execution question, unless the user selected [full-audit.md](full-audit.md).

```text
outcome / ownership: <result; files or areas; off-limits>
contractRef / sourceCommit: <exact reviewed contract and source>
inputs / predecessor: <inspected evidence or commit; dependencies>
acceptance: <binary checks>
CORETEST: <committed core path or actual regression; command>
PROVEONCE: <temporary edge-case evidence; command/result, then delete>
stop: unplanned behavior/contract → return evidence; do not redesign
return: <diff/commit; check outputs; evidence; unresolved issues>
```

Private helpers and edit order belong to the implementer. Parallel workers
require disjoint ownership and stable interfaces; shared state/types/callers
stay together or run after an inspected predecessor. Changing a shared contract
pauses affected work and invalidates only affected evidence, not all prior review.

Coordinator checks the integrated result and affected tests, then the independent
final reviewer reads exact `base..head`. A worker's DONE claim, design review or
approved brief is neither build authority nor proof of the implementation.
