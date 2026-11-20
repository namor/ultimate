import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { context } from '../../server/harness.ts'
import { extensionGraph } from '../../scripts/deps.ts'
import { fauxServer, temp } from '../helpers.ts'

// Each case boots its own server on its own home; a few at a time keep the machine responsive.
vi.setConfig({ maxConcurrency: 6 })

const graph = extensionGraph(resolve('extensions'))
const optional = [...graph].filter(([, entry]) => !entry.core).map(([name]) => name)
const core = [...graph].filter(([, entry]) => entry.core).map(([name]) => name)

/** A faux server on the built-ins with `disable` in the user's settings, and what it reports. */
async function boot(disable: string[]) {
  // helpers.ts removes every temp() home after the file, in parallel and with its own 60 s limit. A serial cleanup of
  // the ~40 homes here ran past the default 10 s hook timeout on a loaded lander (#56220).
  const home = await temp('ultimate-disable-each-')
  await mkdir(join(home, 'project'))
  await mkdir(join(home, '.ultimate'))
  await writeFile(
    join(home, '.ultimate/settings.json'),
    JSON.stringify({ extensions: { disable } }),
  )
  const server = await fauxServer({
    ultimateRoot: resolve('.'),
    projectRoot: join(home, 'project'),
    userHome: home,
    home: join(home, 'state'),
  })
  try {
    const info = server.extensions.info()
    const agent = await server.root.agent(context)
    return {
      enabled: info.filter((entry) => entry.enabled).map((entry) => entry.name),
      errors: info.flatMap((entry) => (entry.server?.error ? [entry.name] : [])),
      diagnostics: server.system.current().extensionDiagnostics,
      missing: server.extensions.catalogue().missing,
      tools: agent.tools.map((tool) => tool.name),
    }
  } finally {
    await server.close()
  }
}

it('knows optional extensions and the core tier', () => {
  expect(optional.length).toBeGreaterThan(10)
  expect(core).toEqual(expect.arrayContaining(['conversations', 'subagents', 'workspaces']))
})

it.concurrent.each(optional)('boots cleanly with %s disabled', async (name) => {
  const state = await boot([name])
  expect(state.enabled).not.toContain(name)
  expect(state.errors).toEqual([])
  expect(state.diagnostics).toEqual([])
  expect(state.missing).toEqual([])
  expect(state.tools).toContain('bash')
})

it.concurrent('keeps every core-tier extension enabled when settings disable them all', async () => {
  const state = await boot(core)
  expect(state.enabled).toEqual(expect.arrayContaining(core))
  expect(state.errors).toEqual([])
  expect(state.diagnostics.toSorted()).toEqual(
    core
      .map((name) => `${name} is core and stays enabled; extensions.disable ignores it`)
      .toSorted(),
  )
  expect(state.missing).toEqual([])
  expect(state.tools).toEqual(expect.arrayContaining(['bash', 'subagent']))
})
