# Evidence and findings

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`; modified for Ultimate. See
[../UPSTREAM.md](../UPSTREAM.md).

Use the existing contract/plan and native child receipts. These are useful
fields, not a second ledger or mandatory report. Keep the source/contract bytes
reachable and avoid a self-referential digest. For a small checked fix there may
be no design-reader record at all.

```text
question / hazard / scope:
contractRef / sourceCommit / evidence refs:
reader: <role, child/input/answer IDs; initial or targeted recheck>
requested / returned model and thinking: <effective profile + envelope; unknowns>
coverage: <required read / extra same-pin / missing>
findings: <stable ID, original blocker|major|nit, claim, evidence, consequence>
disposition: <fix|contest|escalate|decline|accepted-risk; evidence/authority>
verification: <check command/result and revision; reader answer if needed>
remaining uncertainty / next action:
```

Record missing, cancelled, superseded or unexpected-model responses as
incomplete. A recheck in the same reader conversation names the original finding,
new source pin, repair and affected interactions. New contradictory evidence
reopens the affected finding; a new opinion alone does not. Two failed repairs
of the same important obligation require a changed tactic or stop.

Only explicit [full-audit.md](full-audit.md) mode adds its I/C/R obligations,
both intent paraphrases, waves and fresh material-repair checks. Do not impose
that bookkeeping on the adaptive default. Paper examples or reader receipts do
not establish runtime behavior or prove savings.
