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

The option disables package-manager auto-install, not format/lint/type/dependency checks. The configured `vp check && node scripts/deps.ts` actually ran. Direct execution of those same commands also passed. `git diff --check` passed. Markdown formatting was applied only to this research directory. A trial spelling `--verify-deps-before-run=false` was rejected as an unknown option before the correct `--config...` form; no check was claimed from that trial.

## Visual/final review

Pending at this checkpoint. The requested source/portable HTML and actual offline desktop/mobile/light/dark verification are not yet claimed complete. No product resource was installed, activated, landed or published by this research.
