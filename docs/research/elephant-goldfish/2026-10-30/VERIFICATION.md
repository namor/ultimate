# Verification record

## Research/source checks

- Pinned Google EGM at `5efe34126a0059eff51ca7e0af7e3249d70952bf`; all225 tracked paths represented exactly once in `UPSTREAM-COVERAGE.csv`, with SHA-256 and review/exclusion category. Distribution duplicates are byte-compared to canonical paths.
- Old `f0ba151b252c9abf1318d9fe857a43265d06de89` differs only in root/distributed README’s Antigravity command-prefix note.
- Ran inspected stdlib-only `scripts/pack_plugin.py --target claude`, then `diff -qr` generated runtime versus pinned `distributions/claude`: no differences; upstream source checkout clean.
- Inspected declared test dependencies, pytest config, conftest, unit imports and integration helper imports. No live integration collection/flags. Disposable empty-HOME venv/public PyPI install authorized; resolved versions in main report.
- Offline pytest command in main report: **138 passed in1.92s,0 skipped/failed**. This is packaging/metadata/schema/link/trace-helper evidence, not model efficacy.
- Earlier attempts: ordinary Python shim failed; explicit installed Python lacked pytest. Isolated venv resolved the dependency issue, without global or repo package changes.

## Independent supporting scrutiny

Luna supporting evidence reader **#27428** inspected selected upstream review/loop/resolve and local profile text against the report, not all sources. It found two overgeneralizations: the opening conceptual sequence could imply every preset repairs/resolves; the comparison’s technical-coverage row could imply a single uniform dispatch. Both were qualified. This is bounded supporting scrutiny, not final approval or exhaustive independent audit. The reader explicitly could not locate the nested review-rules file and did not audit external papers/runtime in full; no broader approval is inferred.

The coordinator separately read the actual `b1f47fcc0030e9f399ee92614fa1821456e45a0a` resource diff reported by #21909 and added a versioned follow-up, preserving906a as the original draft comparison. Wording repairs are not silently promoted to loader/runtime/usefulness proof.

## Astra research-content review and corrections

The single final-review identity, Astra **#28705**, reviewed the immutable content range `1475c80e27fe540cf600805df6d40dbc7b8abff5..36a9333f2bf38e7cd36d7167fa9e477210502219`. This was a content checkpoint, not overall approval of the still-incomplete visual deliverable. It returned **NEEDS CHANGES** for one material attribution: §3.8 incorrectly credited upstream with reopening settled findings on new contrary evidence. The coordinator independently verified upstream `skills/egm-review-loop/SKILL.md:154–160` and the strengthened proposal `DESIGN.md:89`. The corrected report states upstream’s same-issue/same-scope non-reopening rule literally and attributes the contrary-evidence exception to Ultimate, with its prompt-compliance limitation.

The reviewer independently verified all **225 unique paths and 225 SHA-256 values**, and read the supplied CCR and Stephens papers. Other external sources were not independently retrieved in this pass; recorded implementation test results were not rerun by the reviewer.

Its full-range whitespace check exposed CSV CRLF line endings: `git diff --check 1475c80e..36a9333f` failed with trailing-whitespace diagnostics, reproduced by the coordinator with exit code 2. The earlier unqualified working-tree check did not establish that the committed range was clean. Regenerated the CSV with explicit LF line termination from the same rows, verifying the upstream pin, complete tracked-path set, every source hash, and unchanged parsed fields/order. No whitespace-check suppression or source-pin change.

The coordinator also inspected the actual recorded implementation tool outputs at #21909/25223, #21909/25239 and #21909/25273: project checks, four parsed definitions/license equality, and 51 passing tests respectively. This verifies the recorded results, not an independent rerun or live workflow effectiveness.

## Repository checks before visual implementation

The research worktree had no dependencies. Borrowing the older host install exposed two unchanged `extensions/sounds/engine.ts` Tone type errors. No source change was made to hide them. An initial plain `pnpm check` also attempted pnpm’s default dependency reconciliation and aborted on no TTY; no install/purge was allowed to proceed.

With permission from implementation coordinator #21909, borrowed its already-populated **1475-compatible** dependency tree read-only via a removable local symlink. No install/update or dependency-tree edits. Ran with empty HOME/environment, Node26.12.1:

```sh
pnpm --config.verify-deps-before-run=false check
```

Observed:

```text
pass: All803 files are correctly formatted
pass: Found no warnings, lint errors, or type errors in697 files
✓53 extensions,128 edges: no cycles, the core tier depends only on itself.
```

The option disables package-manager auto-install, not format/lint/type/dependency checks. The configured `vp check && node scripts/deps.ts` actually ran. Direct execution of those same commands also passed. The working-tree `git diff --check` passed at that point; see the later full-range CSV failure and correction above. Markdown formatting was applied only to this research directory. A trial spelling `--verify-deps-before-run=false` was rejected as an unknown option before the correct `--config...` form; no check was claimed from that trial.

## Research correction checks

After the attribution correction and LF regeneration, ran `vp fmt` only on this directory’s Markdown, then the same empty-environment `pnpm --config.verify-deps-before-run=false check`: **804 files formatted; 697 files without lint/type warnings or errors; 53 extensions, 128 edges, no dependency cycles/core-tier violations**. The owner’s dependency tree had since been refreshed for the unrelated `688b2888` host merge; it remained borrowed read-only, without installing or updating packages here. Source baseline remains `1475c80e`.

`git diff --check 1475c80e27fe540cf600805df6d40dbc7b8abff5` passed against the corrected working tree, covering the entire research delta rather than only the latest edit. CSV generation asserted **225 unique pinned paths, 225 matching hashes, identical parsed field values/order, and no CR bytes**. `git diff --ignore-space-at-eol` showed no CSV content change. The normal correction commit preserves `36a9333f`; the same Astra reviewer receives the corrected range for recheck.

## Visual/final review

Overall approval remains pending. The requested source/portable HTML and actual offline desktop/mobile/light/dark verification are not yet claimed complete. The first native visual job produced no patch and failed with process-inventory/cleanup verification unavailable. Its cleanup remains unverified; no retry or replacement job is authorized until the parent separately clears the safety hold. The read-only content review above does not clear that hold. No product resource was installed, activated, landed or published by this research.
