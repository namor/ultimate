# Compact contract

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`; modified for Ultimate. See
[../UPSTREAM.md](../UPSTREAM.md).

Use the existing plan or project design path. One record carries the request,
contract, evidence and decisions; separate design/review/handoff files are not
required. Include only fields that help this task. Full-audit users also include
the explicit obligations in [full-audit.md](full-audit.md).

```text
request / acceptance:
authority: <user or question answer or goal decision; assessment-only if absent>
current flow / reuse: <source facts and relevant callers>
risk boundaries / unresolved questions:
proposed behavior / non-goals / consequential alternatives:
requirement → invariant → executable check:
source: <repository identity + exact before-image commit>
contract: <reachable commit:path or exact bytes + digest in durable record>
sources / evidence: <pinned paths; probe command, result and limitations>
next action: <question it resolves; owner; expected evidence>
```

Pins bind claims, not just files: a changed dependency or assumption can
invalidate coverage. Record excluded/unread material and unproved claims. An
unavailable source is not proof that a contract exists. Important business facts
or predecessor decisions must be supplied with their authority; private author
context is not evidence available to a reader.

Keep worker briefs as references to this contract, with ownership and checks.
Do not prescribe private helper names or duplicate API contracts in another
artifact. A draft lives in a reachable source or durable plan record, not `/tmp`
alone. Author summaries help navigation; readers verify the underlying source.
