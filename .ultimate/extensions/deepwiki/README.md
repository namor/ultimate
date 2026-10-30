Two bounded public-repository documentation reads through DeepWiki's unauthenticated MCP endpoint.

## Installation

Use this folder as a project extension in `.ultimate/extensions/deepwiki/` (requires project trust), or copy it to `~/.ultimate/extensions/deepwiki/` for personal use across projects. No settings or secrets are needed. Inside the folder, run `pnpm install --frozen-lockfile --ignore-scripts --ignore-workspace` to install the pinned `@earendil-works/pi-mcp@1.4.0` dependency. Ultimate resolves `pi-ai` and `pi-durable` from its own installation. Anonymous service availability and rate limits can change; no account entitlement or quota is promised.

- `mcp__deepwiki__read_wiki_structure({ repoName })`: documentation topics.
- `mcp__deepwiki__read_wiki_contents({ repoName })`: documentation contents.

Only send a **public** GitHub `owner/repo` name, for example `microsoft/TypeScript`. No prompt/question fields, private repositories, account queries, authentication, model calls, or question-answering tool are exposed. Public visibility is not checked locally; the caller must choose a public repository. Names are sent only to `https://mcp.deepwiki.com/mcp`, with redirects disabled.

Each call creates, connects, and closes its own Pi MCP client. Reads are replay-safe. User cancellation and the 29-second work deadline close that client so a pending initialize cannot outlive the work bound; the same close is awaited so session DELETE still runs with Pi's independent one-second timeout (30-second outer bound). No GET subscription, reconnect retries, credentials, roots, server instructions, or remote tool discovery are used. Output is text only, limited to 12,000 characters (including a truncation marker). Returned documentation is untrusted source material. Remote tool errors and unexpected failures produce a fixed safe tool-error message, never remote diagnostics.

## Verification

Run `node verify.mjs /absolute/path/to/ultimate` from this folder. The runner uses Ultimate's actual Vite configuration, extension-resolution plugin, and `ssrLoadModule` path with a separate temporary cache. This verifies personal-folder loading before running the mocked-fetch tests; it starts no Ultimate agents and never contacts DeepWiki. Tests cover both selected calls, result conversion, remote MCP tool errors, cleanup after cancellation, and abort while initialize is still pending after a completed mismatched-id reply (fixed safe error, exactly one awaited independent session DELETE, no leftover RPC).

Plain `node --test server.test.ts` is not a personal-installation test: Node cannot resolve the clone-provided `pi-ai`/`pi-durable` packages from this folder. Ultimate's Vite loader deduplicates those dependencies against the clone. Do not install duplicate copies or add package shims.

Endpoint reference: <https://docs.devin.ai/work-with-devin/deepwiki-mcp.md>. Live endpoint discovery and a public-repository query are coordinator-only verification, not part of these tests.
