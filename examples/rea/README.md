# REA CLI workflow for Ultimate

An optional personal CLI installation and skill template for [REA](https://github.com/morluto/rea), not a native Ultimate MCP integration. Nothing in this example is loaded or installed automatically.

## Install manually

Use a supported Node version: REA 6.8.0 declares `^22.23.4 || ^24.22.1 || >=26.12.1`. Install the public `rea-agents` package into a dedicated personal directory, without lifecycle scripts or optional dependencies:

```sh
mkdir -p "$HOME/.ultimate/tools/rea"
npm install --prefix "$HOME/.ultimate/tools/rea" --save-exact \
  --ignore-scripts --omit=optional --no-audit --no-fund rea-agents@6.8.0
"$HOME/.ultimate/tools/rea/node_modules/.bin/rea" --version
```

Expected version: `6.8.0`. This pins the top-level release; keep the generated local lockfile for its resolved dependency versions. Do not commit installed packages or personal configuration to the project. No global install, shell PATH edit, `rea setup`, agent registration or engine installation is needed for this workflow.

Package provenance: npm's `rea-agents@6.8.0` metadata names `github.com/morluto/rea` as its repository. Its published archive integrity is:

```text
sha512-9QDeRnGqEDzABZyr04eLnBXBv/c6I9/TWu/6M0MD4pEfkySI/BIgwTODIbAReX3C1x6hjw9+Jlx4A2yUSPZ9ww==
```

The package manager verifies registry integrity; this is not an independent security audit of the package or dependencies. Recheck public metadata with `npm view rea-agents@6.8.0 version engines repository.url dist.integrity --json` before installing.

## Enable the skill

From the Ultimate checkout, copy only the provided wrapper:

```sh
mkdir -p "$HOME/.ultimate/skills/reverse-engineer-anything"
cp examples/rea/reverse-engineer-anything/SKILL.md \
  "$HOME/.ultimate/skills/reverse-engineer-anything/SKILL.md"
```

Review any existing skill before replacing it. Ultimate discovers the personal skill without a core restart. It directs the agent to the matching official workflow shipped in the installed release, rather than copying or tracking REA's repository-main instructions.

## Scope and limitations

Use only user-selected artifacts and authorized investigation scope; start with static inspection. Installing the package grants no permission to execute a target, attach to processes, capture private data, bypass licenses or mutate applications. Local results returned in a conversation may be sent to the configured model provider.

The CLI version and synthetic static JavaScript analysis were verified for the original personal setup. These instructions do not claim all native engines work: Hopper, Ghidra, IDA and other prerequisites are separate; optional Frida support is omitted and lifecycle scripts are disabled. Report missing prerequisites rather than installing them automatically. Consult the release's bundled workflow and `--help` for supported commands.

REA's broad MCP catalogue includes process/debugger, browser and device mutations. This example does **not** connect it to Ultimate or expose its tools. No account, credentials, host configuration or installed dependency tree is included here.

To remove the setup, remove the copied personal skill and dedicated `~/.ultimate/tools/rea/` directory after checking they contain no work you need. No project or other agent configuration needs changing.
