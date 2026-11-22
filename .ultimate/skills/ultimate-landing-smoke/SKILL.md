---
name: ultimate-landing-smoke
description: 'Check each landing on the running Ultimate host before reporting it as live. Confirm the landed revision, any required restart, and the changed behavior on that host.'
---

# Smoke-check a landing

The landing card reports what merged and whether it needs a restart. It does not prove the running host uses the change.

## Steps

1. Check the running host's clone. It should be clean and at the landed SHA. If main has advanced, record the current SHA and verify that it contains the landing.
2. If the card says `needs restart`, @ultimate calls the `restart` tool as instructed. Record the process generation before and after to confirm the swap. Other agents report a missing restart rather than restarting. Do not restart for this check when the card does not call for one.
3. Check host health after any required restart. Look for build errors, omitted facets, and extension load errors.
   Check provider or model status only when it matters to the landing. For example, inspect `ultimate.doc('pi.agent', conversationId)`
   for the affected conversation when verifying its model routing. Do not probe unrelated providers or start unrelated logins.
   Report missing access for a relevant check as unverified.
4. Observe the changed behavior on the running host. Use a UI interaction, an action result, or a running-host document that shows the change. A merge, a source file, a successful build, or a bundle ID alone does not count. A preview can verify the feature there, but cannot prove it is live on this host.

## Host checks

Run this in codemode to inspect the clone and basic health. It does not check providers or prove the changed behavior.

```js
const sys = await ultimate.system()
const root = "'" + sys.code.ultimateRoot.replace(/'/g, "'\\''") + "'"
const clone = await tools.bash({
  command: `git -C ${root} rev-parse HEAD && git -C ${root} status --short`,
})
const ext = await ultimate.extensions()
return {
  clone,
  processGeneration: sys.process.generation,
  build: sys.build,
  extensionErrors: ext.filter((e) => e.server?.error).map((e) => `${e.name}: ${e.server.error}`),
}
```

## Report

Report the landed SHA, restart status, health findings, and what you observed on the running host. Say `live` only if you observed the changed behavior there. If you could not observe it, report `landed; live behavior unverified` and say which check is missing.
