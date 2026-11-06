This is Ultimate's own repository, and this setup is the one it is built with: Ultimate plans, delegates, checks its
work, and changes its own code while you talk to it.

## What it adds

Every built-in is already on; this setup adds how the repository is landed and reviewed:

- `settings.json`: each worktree isolate installs its dependencies, and the lander runs `pnpm check`, then
  `pnpm test` and `pnpm test:e2e` in parallel, and pushes to `origin`.
- `agents/reviewer-*.md`: optional correctness, simplicity and architecture specialists. One `reviewer` owns
  the verdict and calls a specialist only for a named uncovered hazard.

## Model policy

`fastModels` requests the priority tier for Sol, Astra and Luna across conversations, subagents and summaries. Fast mode increases usage costs; it does not change reasoning effort.

The standing @ultimate uses GPT-6.1 Sol at high effort for routing and recorded status.
Tiny helpers remain Luna at low effort. Coordinators retain task ownership on GPT-6.1 Sol at extra-high effort. Optional workers,
designers and early design readers use Sol at high effort; a named difficult or sensitive question uses Sol at
extra high for that question. One fresh independent final reviewer uses Astra at high effort; its repair checks stay
in the same conversation. Supporting reviewers use Sol or Luna. The dispatcher resolves existing task conversation
IDs before forwarding follow-ups.

These project settings and overlays apply only when project resources are enabled. They preserve personal
settings and trust decisions. Ordinary existing chats retain their selected models; refreshing a standing agent
reapplies its definition's model and effort. Explicit task pins and preview overrides
still require the existing returned-model checks; configuration is not proof of which model answered. This policy
has no established general quality or efficiency advantage; bounded routing probes do not establish an optimum.

To adopt parts of this setup in another project, ask its @ultimate for a tour (the `adopt-ultimate-setup` skill);
onboarding offers it too.

## How to work with it

See [the work model](../AGENTS.md#how-work-is-organised-a-forest-of-conversation-trees) for coordination and
[Surfaces](../README.md#surfaces) for apps beside the conversation.

## How it runs

See [reload layers](../AGENTS.md#layers-and-how-they-reload), [running the server](../docs/running.md) and
[durability](../docs/durability.md) before changing the running system.

## Read more

`README.md` to start, `AGENTS.md` for the reload layers and the rules, `extensions/README.md` to write extensions.
