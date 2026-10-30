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
    plugins: [extensionModules(root, root, homedir())],
  })
  const module = await vite.ssrLoadModule(join(folder, 'server.ts'))
  assert.deepEqual(
    module.default().tools.map((tool) => tool.name),
    ['mcp__exa__web_search_exa', 'mcp__exa__web_fetch_exa'],
  )
  console.log('Ultimate extension loader: both public documentation tools loaded')
  await vite.ssrLoadModule(join(folder, 'server.test.ts'))
} finally {
  await vite?.close()
  await rm(cache, { recursive: true, force: true })
}
