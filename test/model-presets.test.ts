import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { ExtensionHost } from '../server/extensions.ts'
import { readFamilies, writeFamilies } from '../lib/families-settings.ts'
import { readSettings, userSettingsPath } from '../lib/settings.ts'
import {
  applyPreset,
  deletePreset,
  presetsPath,
  presetsView,
  savePreset,
} from '../extensions/models/presets.ts'
import { temp } from './helpers.ts'

/** A host whose logins cover `available` (`provider/id`), with a coordinator agent on its own family. */
async function setup(available: string[]) {
  const root = await temp('ultimate-presets-')
  const userHome = join(root, 'home')
  const projectRoot = join(root, 'project')
  const ultimateRoot = join(root, 'ultimate')
  await mkdir(join(ultimateRoot, 'agents'), { recursive: true })
  await mkdir(join(userHome, '.ultimate'), { recursive: true })
  await mkdir(projectRoot)
  const agent =
    '---\nname: coordinator\ndescription: Coordinates\nfamily: coordinator\n---\nWork.\n'
  await writeFile(join(ultimateRoot, 'agents/coordinator.md'), agent)
  const runtime = {
    getAvailable: async () =>
      available.map((ref) => ({
        provider: ref.split('/')[0],
        id: ref.slice(ref.indexOf('/') + 1),
      })),
    getProvider: (id: string) =>
      id === 'claude-code' ? { auth: { oauth: { name: 'Claude Code' } } } : undefined,
    getModel: () => undefined,
  }
  const host = {
    userHome,
    projectRoot,
    ultimateRoot,
    modelRuntime: runtime,
    projectSettings: async () => ({}),
  } as unknown as ExtensionHost
  const settings = () => readSettings(userSettingsPath(userHome))
  const writeSettings = (value: object) =>
    writeFile(userSettingsPath(userHome), JSON.stringify(value))
  return { host, userHome, projectRoot, agent, ultimateRoot, settings, writeSettings }
}

const claude = {
  families: {
    default: { model: 'claude-code/claude-sonnet-5-5', thinking: 'medium' },
    review: { model: 'claude-code/claude-opus-5-5' },
    fast: { model: 'claude-code/claude-sonnet-5-5' },
    tiny: { model: 'claude-code/claude-sonnet-5-5' },
    coordinator: { model: 'claude-code/claude-opus-5-5', color: 'sky' },
  },
}
const sol = 'openai-codex/gpt-6.1-sol'
const codex = {
  families: {
    default: { model: sol },
    review: { model: sol },
    tiny: { model: sol },
    design: { model: sol },
  },
}

it('saves the families and pins that apply, and applying one brings them back', async () => {
  const { host, userHome, projectRoot, settings, writeSettings } = await setup([
    'claude-code/claude-sonnet-5-5',
    'claude-code/claude-opus-5-5',
    sol,
    'openai-codex/gpt-6-luna',
  ])
  await writeFamilies(userHome, projectRoot, claude)
  await writeSettings({ summaryModel: 'openai-codex/gpt-6-luna:low', theme: 'dark' })
  await savePreset(host, 'Claude')
  await writeFamilies(userHome, projectRoot, { ...codex, assign: { summaries: 'tiny' } })
  await writeSettings({ instance: { model: null, port: 1 }, theme: 'dark' })
  await savePreset(host, 'ChatGPT')

  const view = await presetsView(host)
  expect(view.presets.map((preset) => [preset.name, preset.current])).toEqual([
    ['ChatGPT', true],
    ['Claude', false],
  ])
  // ChatGPT has no coordinator family: the coordinator agent would fall back to the default family.
  expect(view.presets[0].orphans).toEqual([{ agent: 'coordinator', family: 'coordinator' }])
  expect(view.presets[1].orphans).toEqual([])

  await applyPreset(host, 'Claude')
  const families = await readFamilies(userHome, projectRoot, {})
  expect(families.families.coordinator.model).toBe('claude-code/claude-opus-5-5')
  expect(families.families.default.thinking).toBe('medium')
  expect(families.assign).toEqual({})
  // The summaries pin is back, the preview pin gone, other settings kept.
  expect(await settings()).toEqual({
    summaryModel: 'openai-codex/gpt-6-luna:low',
    instance: { port: 1 },
    theme: 'dark',
  })
  expect((await presetsView(host)).presets.find((preset) => preset.current)?.name).toBe('Claude')

  await applyPreset(host, 'ChatGPT')
  expect((await readFamilies(userHome, projectRoot, {})).families.coordinator).toBeUndefined()
  expect(await settings()).toEqual({ instance: { model: null, port: 1 }, theme: 'dark' })

  await deletePreset(host, 'Claude')
  expect((await presetsView(host)).presets.map((preset) => preset.name)).toEqual(['ChatGPT'])
  await expect(deletePreset(host, 'Claude')).rejects.toThrow('No preset Claude')
})

it('refuses a preset whose models have no login, writing nothing', async () => {
  const { host, userHome, projectRoot, settings, writeSettings } = await setup([sol])
  await savePreset(host, 'Claude', { ...claude, assign: {}, pins: {} })
  await writeFamilies(userHome, projectRoot, codex)
  await writeSettings({ summaryModel: 'openai-codex/gpt-6-luna:low' })
  const before = await readFile(join(userHome, '.ultimate/model-families.json'), 'utf8')

  const [view] = (await presetsView(host)).presets
  expect(view.missing).toEqual([
    {
      provider: 'claude-code',
      name: 'Claude Code',
      models: ['claude-code/claude-sonnet-5-5', 'claude-code/claude-opus-5-5'],
    },
  ])
  await expect(applyPreset(host, 'Claude')).rejects.toThrow(
    'Claude needs a login first: Claude Code',
  )
  expect(await readFile(join(userHome, '.ultimate/model-families.json'), 'utf8')).toBe(before)
  expect(await settings()).toEqual({ summaryModel: 'openai-codex/gpt-6-luna:low' })
})

it('keeps a corrupt or newer presets file as it is and refuses to write over it', async () => {
  const { host, userHome } = await setup([])
  for (const text of ['{"version": 1, "presets": {', '{"version": 2, "presets": {}}']) {
    await writeFile(presetsPath(userHome), text)
    await expect(presetsView(host)).rejects.toThrow(/JSON|presets file/)
    await expect(savePreset(host, 'Mine')).rejects.toThrow(/JSON|presets file/)
    expect(await readFile(presetsPath(userHome), 'utf8')).toBe(text)
  }
  await expect(savePreset(host, ' padded')).rejects.toThrow('surrounding spaces')
})

it('leaves agent definitions alone when applying', async () => {
  const { host, agent, ultimateRoot } = await setup([sol])
  await savePreset(host, 'ChatGPT', { ...codex, assign: {}, pins: {} })
  await applyPreset(host, 'ChatGPT')
  expect(await readFile(join(ultimateRoot, 'agents/coordinator.md'), 'utf8')).toBe(agent)
})
