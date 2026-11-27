---
name: ultimate-landing-smoke
description: 'After each landing, verify the revision, any required restart, and the changed behavior on the running Ultimate host before reporting it as live.'
---

# Smoke-check a landing

The landing card reports what merged and whether it needs a restart. It does not prove the host runs the change.

## Steps

1. **Clone:** the host clone is on the card's sha and clean (`git log --oneline -1`, `git status --short`).
2. **Restart:** only a card with `needs restart` needs one, and @ultimate calls the `restart` tool for it as its
   prompt says; everything else reloads on its own. Another agent reports a missing restart rather than restarting.
3. **Health.** Confirm any required restart by comparing the process generation before and after. Check for build errors,
   omitted facets, and extension load errors. Check provider or model status only when it matters to the landing.
   Do not probe unrelated providers or start unrelated logins.
4. **Behavior.** Observe the change on the running host after landing. Use a UI interaction, an action result, or a
   host document that shows the changed behavior. A merge, source file, successful build, bundle ID, or preview alone
   does not prove the change is live.

## One snippet

Run this in codemode for clone and host health. It does not check providers or prove the changed behavior.

```js
const sh = async (command) => {
  const { output, exitCode } = await tools.bash({ command })
  if (exitCode !== 0) throw new Error(`${command} exited ${exitCode}: ${output}`)
  return output.trim()
}
const sys = await ultimate.system()
const root = "'" + sys.code.ultimateRoot.replace(/'/g, "'\\''") + "'"
const clone = await sh(`git -C ${root} log --oneline -1 && git -C ${root} status --short`)
const ext = await ultimate.extensions()
return {
  clone,
  processGeneration: sys.process.generation,
  build: {
    generation: sys.build.generation,
    at: sys.build.at,
    error: sys.build.error,
    left: sys.build.left,
  },
  extensionErrors: ext.filter((e) => e.server?.error).map((e) => `${e.name}: ${e.server.error}`),
}
```

## Report

Report the landed SHA, restart status, health findings, and what you observed on the running host. Say `live` only
if you observed the changed behavior there. Otherwise report `landed; live behavior unverified` and name the missing check.
