# design-checkpoint resources

Portable personal-resource bundle for the adaptive design-to-implementation
checkpoint. **Not installed by the presence of this folder.** No autoinstaller,
no settings or trust edits, no symlinks, no runtime/core/UI/dependency changes.

Adapted from google/elephant-goldfish-model (Apache-2.0), pin
`f0ba151b252c9abf1318d9fe857a43265d06de89`. See
[skills/design-checkpoint/UPSTREAM.md](skills/design-checkpoint/UPSTREAM.md) and
[skills/design-checkpoint/LICENSE](skills/design-checkpoint/LICENSE). No Google
endorsement. This is not EGM-certified.

## Staged tree → `~/.ultimate`

| Staged path                                                                                             | Install target                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `skills/design-checkpoint/` (entire directory: `SKILL.md`, `LICENSE`, `UPSTREAM.md`, `references/*.md`) | `~/.ultimate/skills/design-checkpoint/`                |
| `agents/design-intent.md`                                                                               | `~/.ultimate/agents/design-intent.md`                  |
| `agents/design-critic.md`                                                                               | `~/.ultimate/agents/design-critic.md`                  |
| `agents/design-readiness.md`                                                                            | `~/.ultimate/agents/design-readiness.md`               |
| `agents/design-domain.md`                                                                               | `~/.ultimate/agents/design-domain.md`                  |
| `overlays/coordinator.md`                                                                               | **append body** to `~/.ultimate/agents/coordinator.md` |
| `overlays/ultimate.md`                                                                                  | **append body** to `~/.ultimate/agents/ultimate.md`    |

Relative links in the skill (`references/…`, `LICENSE`, `UPSTREAM.md`) resolve
when the skill directory is copied as a unit. Profile links
`../skills/design-checkpoint/…` resolve from `~/.ultimate/agents/`.

## Names-free check (required)

Stop if any target already exists; do not overwrite user files:

```sh
test ! -e ~/.ultimate/skills/design-checkpoint \
  && test ! -e ~/.ultimate/agents/design-intent.md \
  && test ! -e ~/.ultimate/agents/design-critic.md \
  && test ! -e ~/.ultimate/agents/design-readiness.md \
  && test ! -e ~/.ultimate/agents/design-domain.md \
  && ! grep -q 'design-checkpoint overlay fragment' \
       ~/.ultimate/agents/coordinator.md ~/.ultimate/agents/ultimate.md 2>/dev/null
```

If the overlay files exist but lack the fragment marker, they are eligible for
**append**. If they already contain the marker, stop.

## Copy owned skill and profiles

Parent (@ultimate) copies owned files after an explicit user go. Preserve bytes:

```sh
mkdir -p ~/.ultimate/skills ~/.ultimate/agents
cp -R skills/design-checkpoint ~/.ultimate/skills/design-checkpoint
cp agents/design-intent.md agents/design-critic.md \
   agents/design-readiness.md agents/design-domain.md ~/.ultimate/agents/
```

Do not change `settings.json`, `trust.json`, model families, or `reviewer-*`.

## Append overlay fragments

Overlays in this bundle are **body-only fragments**, not definitions. They must
not replace frontmatter, `family`, model, tools, Dream/Grok preflight, or
existing body.

1. If `~/.ultimate/agents/coordinator.md` (or `ultimate.md`) **exists**: append
   the matching `overlays/*.md` fragment **after** the current body. Keep the
   existing YAML (including `addTools: []` if present) unchanged.
2. If it **does not exist**: create an overlay that extends the built-in of the
   same name, with only:

   ```yaml
   ---
   name: coordinator # or ultimate
   addTools: []
   ---
   ```

   then the fragment. Do not copy a full definition; that would replace the
   built-in instead of appending.

## Rollback

1. Through the **original owning coordinator**, `subagent stop` every captured
   child started for this checkpoint. Parent stop does not cascade. Verify Stop
   receipts. If receipts are missing, rollback of running work is blocked;
   still remove files only when no owned children remain, or stop first.
2. Remove **only** owned additions:
   - `~/.ultimate/skills/design-checkpoint/`
   - `~/.ultimate/agents/design-intent.md`
   - `~/.ultimate/agents/design-critic.md`
   - `~/.ultimate/agents/design-readiness.md`
   - `~/.ultimate/agents/design-domain.md`
   - the block between `<!-- design-checkpoint overlay fragment -->` and
     `<!-- /design-checkpoint overlay fragment -->` in the two overlay files
3. If an overlay file then has empty body but you created it solely for this
   fragment, delete that overlay file. If it had other user body/frontmatter,
   leave that file.
4. Preserve user settings, trust, models, `reviewer-*`, messages, evidence and
   root memory.

## Verification status and limits

Disposable actual-loader and normal owned fresh-child fixtures have passed:
declined-trust personal discovery, append-only current overlay preservation,
profile configuration, skill expansion, pinned source/rules reads and selected
transcript canaries. The child ran on **faux**, not live Sol. Its read/bash tool
list and inherited system context do not establish capability confinement or
full-host isolation. `pnpm check` alone does not load personal resources.

Installation, activation and the read/bash capability decision remain **pending**.
So does one real authorized new-feature rollout (full applicable O1–O8 after
activation, plus a small-fix 0-reader control, with effort/usefulness).
Seventeen paper traces and the fixtures do not prove real review judgment or
workflow usefulness.
