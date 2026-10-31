# Visual comparison companion

Open `comparison.html` directly in a browser. It is a single offline file; the Markdown/CSV links are optional companion navigation. Edit `comparison.src.html`, then render again. Do not edit the generated HTML.

## Build and provenance

- Canonical public resource: [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer/tree/5f378868e0ea745a6284b51e710c390f0c76f72c), pin `5f378868e0ea745a6284b51e710c390f0c76f72c`, skill v0.14.0.
- Read the canonical skill, compare command, style guide and kit reference. The artifact uses the paper register and the real exported `renderPage` / `prepareRenderedHtml` API—not a registered native command or a plugin installation.
- Implementation provenance: the user explicitly authorized this Sol 6.1/high native implementation trial. No Cursor artifacts were used; this work neither resumed nor repaired the separate paused/failed Cursor job.
- Set `VISUAL_EXPLAINER_SKILL` to the pinned checkout's `plugins/visual-explainer` directory. From the repository root:

```sh
node docs/research/elephant-goldfish/2026-10-30/render-comparison.mjs "$VISUAL_EXPLAINER_SKILL"
# With this repository's existing dependencies, normalize generated output for its format check:
node_modules/.bin/vp fmt docs/research/elephant-goldfish/2026-10-30/comparison.html
```

No install or server is needed. The renderer uses its vendored dependencies. The wrapper inlines the canonical kit, removes exactly its three known Google Fonts/preconnect links, retains system-font overrides, and disables host send-back. A restrictive content policy blocks remote assets, connections, fonts and form submission. The kit's optional annotation/reply UI remains local; no host bridge is enabled.

`VISUAL-EXPLAINER-LICENSE.txt` is byte-equal to upstream's MIT license. Its full text is also embedded in `comparison.html`, so attribution travels with a copied page. The wrapper takes the kit path as an argument; no machine-specific paths are embedded.

## Content boundary

The report is authoritative. The companion preserves the updated §3.8 distinction: reopening settled findings on new contrary evidence is **local policy**, not an upstream rule. It preserves §7's source-supported / hypothetical / unproved distinctions, prominent tool-withholding regression, seven-to-four attention losses, and conditional allocation examples.

The 138 upstream checks were executed in the research, not by this visual build. The 17 scenarios are paper cases. The coordinator inspected recorded four-profile parsing, license and 51-test outputs; these were not independently rerun here or by the research coordinator. No count is combined or presented as efficacy. The inspected b1f47fcc wording repair remains separate from the frozen 906a draft.

**Later A/B mechanics evidence, not a new baseline:** the research coordinator inspected the current A fixture diff, B source patch and actual output **#21909/31296**, not a rerun: **A passed in 37 ms; B in 98 ms; 2 selected tests passed, 46 unrelated tests filtered out**. A exercises actual `discoverAgents`, `projectSkills` and `expandSkillCommand` with declined project trust and current personal overlay snapshots, preserving the explicit Sol implementation trial and Dream request preflight. Its loader checks retain personal profiles/skill expansion, resolved model metadata, excluded project overrides, local links/no symlinks and an unchanged unrelated file. Refreshed A source SHA-256: `6e943b62f5157d428953a121aac658247b65c0720b56bb9f40cadd69e9ba2056`.

B starts the discovered personal intent reader through the actual subagent path with `fork:false`, read/bash tools and pinned source/rules reads. Author-history/prior-verdict canaries are absent; an inherited system canary remains. Returned identity is **`faux/faux-1`**, not live Sol. Its initial failed assertion expected the codemode extension to be absent; the corrected fixture distinguishes a retained extension from an unexposed tool. Preserved B patch SHA-256: `3e0af4705ccd25da73fef519bb2346d01ae9e8d6882fb78afd9e1865247ac995`.

These are selected-registry mechanics with scripted faux responses, not context isolation, a full-host capability audit or live model compliance/usefulness. Final resource review, actual rollout and comparative usefulness remain pending. The earlier A-only run remains chronology in report §6.5; frozen comparison pins remain unchanged and bash remains available.

## Coordinator verification

After the content-only A/B update and scoped formatting, the coordinator rendered again and applied the repository formatter to the generated output. The initial generated-output format check failed; formatting resolved it, and the research directory’s nine formattable files passed the scoped check. This final formatting step is part of reproducing the committed output, not an additional browser dependency. Final portable output: **115,039 bytes**, SHA-256 `53f97a59aa474428f88f1ac1d76e070222c23a44d563d9fdc518b1eb4dd5ae3e`.

A fresh offline Chrome/file-URL check of that final output at 390px/dark passed: seven captioned figures, 17 comparison rows, seven role rows, one h1, resolved anchors and labelled/focusable table regions, zero HTTP requests/page or console errors/whole-page overflow. Focusing the comparison region, pressing ArrowRight and waiting for positive `scrollLeft` verified keyboard horizontal scrolling with a solid focus outline; details opened. The coordinator looked at fresh mobile first-viewport/pipeline captures and the worker’s desktop/table/light/dark images. No styling changed in the later evidence update. Physical touch hardware, screen-reader output and paginated print/PDF remain untested; these checks are not a complete accessibility audit. Project-wide check and final immutable-range review are recorded separately in `VERIFICATION.md`.

## Earlier worker verification observed

- Final A/B evidence re-render succeeded: **83,674 bytes**, seven captioned figures, 619 prose words outside figures; no kit errors/warnings. Output SHA-256: `f079b12c75468ab32c17fc009abfb3d44c16bb64970d71e53744521227d63546`. The unchanged semantic comparison table has **17 body rows**; the separate role table maps all seven reviewer lenses.
- Wrapper static checks passed: no remote asset references, external CSS imports/fonts, send-back attribute, or private absolute paths. License equality and `node --check render-comparison.mjs` passed.
- Failure proof: temporarily changed only the source register to `invalid-build-check`. The actual build exited 1 with `is not a register`; the previously generated output's SHA-256 stayed `192a598668f5dabb40791df9edaecbea9906a8c601a0ddc57bef46b51e205f4c`. Restored the source and rendered successfully. No invalid fixture remains.
- Before the loader-only text update, used already-installed `playwright-core` and Chrome, **file URL**, offline mode, reduced motion, at **390 and 1280 CSS px**, both light and dark. All four cases: **zero HTTP(S) requests, console/page errors, or whole-page horizontal overflow**. All internal anchors resolved; native details opened. Both table scroll regions are labelled and keyboard-focusable, with a visible solid focus outline. Mobile table width is contained (348px viewport within the region; 680/960px contents).
- Before the loader-only text update, read desktop-light/mobile-dark first-viewport images and desktop-dark/mobile-light table images. The entire first figure ends at about 490px desktop / 727px mobile in a 900px viewport. Screenshots are temporary review evidence outside the checkout, not shipping dependencies. Full-page captures were also inspected for overall structure.
- Before the loader-only text update, print-media DOM check at 1280px: no horizontal page overflow; table minimum width resets to zero. A paginated print preview/PDF was **not** inspected.
- Impeccable detector ran once on the editable source and exited 2 with warnings: unresolved build-time `kit.css`, table-wrapper padding, small print text and contrast-style prose cadence. Raised print table text from 10px to 12px; the detector was not rerun. Browser images and computed layout, not this source-only detector, established the screen checks above. The table cells have their own padding; the wrapper intentionally does not duplicate it.
- No project-wide checks/full tests, installs, servers, live models, subagents, resource/config edits, commit or push. The coordinator accepted the quiet presentation and subsequently reported a fresh mobile Chrome pass, including keyboard horizontal scrolling greater than zero. This final A/B evidence update changes no styling and runs only the renderer; no Chrome or heavy tests were rerun here. Final visual review of the updated text and paginated print inspection remain with the coordinator.
