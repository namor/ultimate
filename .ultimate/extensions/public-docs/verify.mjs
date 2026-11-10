import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (!process.argv[2]) throw new Error('Usage: node verify.mjs /path/to/ultimate')
const root = resolve(process.argv[2])
const folder = fileURLToPath(new URL('.', import.meta.url))
const { createServer } = await import(
  pathToFileURL(join(root, 'node_modules/vite-plus/dist/index.js')).href
)
const { extensionModules } = await import(
  pathToFileURL(join(root, 'server/vite-extensions.ts')).href
)
const cache = await mkdtemp(join(tmpdir(), 'ultimate-public-docs-test-'))
let vite
try {
  vite = await createServer({
    configFile: join(root, 'vite.config.ts'),
    root: join(root, 'web'),
    cacheDir: cache,
    server: { middlewareMode: true, fs: { allow: [root, folder] } },
    plugins: [
      extensionModules(root, root, homedir()),
      // Only SSR loads run here. @vitejs/plugin-react lists React for the browser-dependency optimizer, which then
      // bundled into cacheDir/deps_temp_* in the background while the cleanup below removed cacheDir: ENOTEMPTY in
      // #61963's lander run. Turning it off after every plugin ran keeps it off.
      {
        name: 'no-deps-optimizer',
        enforce: 'post',
        configEnvironment: (_, config) => {
          config.optimizeDeps = { ...config.optimizeDeps, noDiscovery: true, include: [] }
        },
      },
    ],
  })
  const module = await vite.ssrLoadModule(join(folder, 'server.ts'))
  assert.deepEqual(
    module.default().tools.map((tool) => tool.name),
    [
      'mcp__exa__web_search_exa',
      'mcp__exa__web_fetch_exa',
      'mcp__context7__resolve_library_id',
      'mcp__context7__query_docs',
    ],
  )
  console.log('Ultimate extension loader: all four public documentation tools loaded')
  await vite.ssrLoadModule(join(folder, 'server.test.ts'))
} finally {
  await vite?.close()
  await rm(cache, { recursive: true, force: true })
}
