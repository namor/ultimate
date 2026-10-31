# Review record

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`, resolve and review-loop skills.
Modified for Ultimate. See [../UPSTREAM.md](../UPSTREAM.md).

Keep this file separate from the design so the design commit is not
self-referential. Existing project equivalents win.

## Result (per child)

```text
role: I|C|R|D|P   wave: n   attempt: 1|2
childId / inputId / answerId
returnedModel: <provider/id from envelope, not self-report>
I paraphrases:          # required from I even when Findings: None
  What this proposes: <2–5 sentences>
  How the existing system works, per the supplied design: <2–5 sentences>
coverage: required read / extra same-pin / missing
findings: ID, original severity, scope, claim, evidence, consequence
```

Incomplete, not-run, cancelled, superseded: record that status. Do not promote
late answers on cancelled packets.

## Resolution

```text
finding ID → fix|contest|escalate|decline|accepted-risk
why / evidence / authority
new packet or delta:
invalidated obligations:
required fresh verification → child/answer or pending
```

## Illustrative medium (paper only)

Coupled typed-origin delivery. Not a historical receipt, not build authority,
not a request to rebuild a shipped feature.

**Packet p1 faults (injected):** infer origin from a text prefix; finish a plan
task when a report arrives; split type/writer, renderer and consumers across
three workers.

| ID           | Finding                                                                            | Disposition                                                          |
| ------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| I1-1 major   | Auto-finishing a plan task is unrequested; plan status is not delivery completion. | **fix** intent; fresh I2.                                            |
| C1-1 blocker | Prefix fallback attributes ordinary human lookalikes as agent input.               | **fix**; R may close by inspecting source/tests and the final brief. |
| C1-2 major   | Parent Stop does not cancel owned children.                                        | **fix** the promise, not core lifecycle: explicit child Stop.        |

Author retains rejected “prefix compatibility” and “auto-finish” alternatives in
this record (readers never saw the predecessor chat).

**p2 + tentative three-worker outline → R1:**

| ID           | Finding                                                                                                                   | Disposition                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| R1-1 major   | Files labelled Create already exist at the before-image.                                                                  | **fix** file-action inventory.                     |
| R1-2 major   | Consumer unit leaves unnamed production callers.                                                                          | **fix**; name them or mark blocked.                |
| R1-3 blocker | Old type constructors, server export and UI query still share one type; splitting owners yields no buildable predecessor. | **fix**: one atomic worker; no compatibility shim. |
| R1-4 blocker | Outline imports a later UI shell that does not exist at the before-image.                                                 | **fix**: preserve current section/card/chip.       |

**Fresh R2** on the corrected atomic outline actually checks those repairs plus
full briefs and post-fix simplicity (no global cascade/framework). Paper-ready
only; actual go still required. Conditional implementation: coordinator → **W1
atomic** → integration → checks → one Astra. This walkthrough is illustrative;
seventeen paper cases are not runtime proof.
