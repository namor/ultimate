# Design packet

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`, `skills/egm-draft/SKILL.md` and
`skills/egm-draft/references/design_doc.md`. Modified for Ultimate. See
[../UPSTREAM.md](../UPSTREAM.md).

Existing project design paths win. Default: `docs/designs/<slug>.md` plus
`docs/designs/<slug>-review.md`. No nine-section ceremony, file-count quota, or
hidden recommendation in chat.

## Freeze

```text
repository: <identity>
sourceCommit: <full SHA of the before-image>
designRef: <commit:path>          # reachable doc commit, or exact bytes+digest
outlineRef: <commit:path#section>
rulesRef: <skill>/references/review-rules.md
profileRefs: design-intent, design-critic, design-readiness, design-domain
index: <pinned paths the author listed>
probes: <evidence ref / date / digest, or none>
authority: <user message | question card | goal decide | none=assessment-only>
allocation: I+C [+D…] then R; expected launches: <low–high> because <hazards>
```

Prefer a reachable focused documentation commit. If a draft commit is
unsuitable, store exact bytes in the review record and verify the digest on
reopen.

## Design body (O1)

1. **Request** — what the user asked, in their terms.
2. **Current system** — how source behaves **now** at `sourceCommit` (constructors,
   callers, tests). Later oracles stay labelled references, not present state.
3. **Proposal** — intended behavior after the change.
4. **Alternatives** — each rejected option and why (complexity, reuse, risk).
   Retain rejected alternatives; readers cannot recover them from excluded chat.
5. **Non-goals** — explicit exclusions (no extra surface, no cascade, no
   compatibility shim merely to preserve worker count).
6. **Contracts** — behavior, APIs, errors, recovery. Private helper names/syntax
   stay with the implementer.
7. **Unknowns / probes** — what is unproved; blocked claims named as blocked.
8. **Authority** — assessment-only, existing go (quote scope), or goal. Quote
   predecessor decisions that bind architecture, interfaces or dependencies.
   Report contradictions; do not silently rewrite them.

No production implementation in this file. Pseudocode/API sketches are fine.
Tentative work units may live here; the **final** briefs belong in the handoff
artifact R actually reads.
