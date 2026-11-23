import { join } from 'node:path'
import type { JsonObject } from '@earendil-works/pi-durable'
import type { ExtensionHost } from '../../server/extensions.ts'
import { discoverAgents } from '../../lib/agents.ts'
import { meansNone } from '../../lib/errors.ts'
import { DEFAULT_FAMILY, FEATURES, mergeFamilies, parseFamilies } from '../../lib/families.ts'
import { readFamilyLayers } from '../../lib/families-settings.ts'
import { readJson, updateJson } from '../../lib/json-file.ts'
import { readSettings, updateSettings, userSettingsPath } from '../../lib/settings.ts'
import { saveFamilies } from './families.ts'
import type { Preset, PresetsView, PresetView } from './refs.ts'

export const presetsPath = (userHome: string) => join(userHome, '.ultimate/model-presets.json')

const VERSION = 1
const MAX_PRESETS = 50
const MAX_NAME = 40
type Stored = { version: number; presets: Record<string, Preset> }

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const levels = /:(off|minimal|low|medium|high|xhigh|max)$/
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function checkName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) throw new Error('A preset needs a name')
  if (name !== name.trim()) throw new Error('A preset name has no surrounding spaces')
  if (name.length > MAX_NAME) throw new Error(`A preset name has at most ${MAX_NAME} characters`)
  if (
    Array.from({ length: name.length }, (_, i) => name.charCodeAt(i)).some(
      (code) => code < 0x20 || code === 0x7f,
    )
  )
    throw new Error('A preset name has no control characters')
  if (name === '__proto__') throw new Error('A preset cannot be named __proto__')
  return name
}

function checkPin(value: unknown, where: string) {
  if (value === null || (typeof value === 'string' && /^[^/\s]+\/\S+$/.test(value))) return value
  throw new Error(`${where} must be "provider/id" or null`)
}

export function parsePreset(value: unknown, where = 'preset'): Preset {
  if (!isObject(value)) throw new Error(`${where} must be an object`)
  const { families, assign } = mergeFamilies(
    parseFamilies({ families: value.families, assign: value.assign }),
  )
  const pins: Preset['pins'] = {}
  if (value.pins !== undefined && !isObject(value.pins))
    throw new Error(`${where}.pins must be an object`)
  for (const [feature, pin] of Object.entries(value.pins ?? {})) {
    if (feature !== 'summaries' && feature !== 'preview')
      throw new Error(`${where}.pins.${feature}: only summaries and preview are pinned`)
    pins[feature] = checkPin(pin, `${where}.pins.${feature}`)
  }
  for (const user of Object.keys(assign))
    if (user === 'automaticPlan' || !Object.hasOwn(FEATURES, user)) delete assign[user]
  for (const [user, family] of Object.entries(assign))
    if (!Object.hasOwn(families, family))
      throw new Error(`${where}.assign.${user}: unknown family ${family}`)
  return { families, assign, pins }
}

async function readStored(path: string): Promise<Stored> {
  const value = await readJson<unknown>(path, { version: VERSION, presets: {} }).catch(
    (error: unknown) => {
      throw new Error(`${path} is not valid JSON; fix or move it (${errorText(error)})`)
    },
  )
  if (!isObject(value) || value.version !== VERSION || !isObject(value.presets))
    throw new Error(`${path}: not a version ${VERSION} presets file; fix or move it`)
  const presets: Record<string, Preset> = {}
  for (const [name, preset] of Object.entries(value.presets))
    presets[checkName(name)] = parsePreset(preset, `${path}: ${name}`)
  return { version: VERSION, presets }
}

const pinOf = (settings: JsonObject, feature: 'summaries' | 'preview') => {
  if (feature === 'summaries')
    return Object.hasOwn(settings, 'summaryModel') ? settings.summaryModel : undefined
  const instance = settings.instance
  return isObject(instance) && Object.hasOwn(instance, 'model') ? instance.model : undefined
}

async function capture(host: ExtensionHost): Promise<Preset> {
  const { base, errors } = await readFamilyLayers(host.userHome, host.projectRoot, {})
  if (errors.length) throw new Error(errors.join('\n'))
  const user = await readSettings(userSettingsPath(host.userHome))
  const pins: Preset['pins'] = {}
  for (const feature of ['summaries', 'preview'] as const) {
    const pin = pinOf(user, feature)
    if (pin !== undefined) pins[feature] = checkPin(pin, `settings ${feature} pin`)
  }
  return parsePreset({ ...base, pins })
}

const modelsOf = (preset: Preset) => [
  ...new Set(
    [
      ...Object.values(preset.families).map((family) => family.model),
      ...Object.values(preset.pins).map((pin) => pin?.replace(levels, '')),
    ].filter((model): model is string => !!model),
  ),
]

const availableModels = async (host: ExtensionHost) =>
  new Set((await host.modelRuntime.getAvailable()).map((model) => `${model.provider}/${model.id}`))

function missingLogins(host: ExtensionHost, preset: Preset, available: Set<string>) {
  const missing = new Map<string, string[]>()
  for (const model of modelsOf(preset))
    if (!available.has(model)) {
      const provider = model.slice(0, model.indexOf('/'))
      missing.set(provider, [...(missing.get(provider) ?? []), model])
    }
  return [...missing].map(([provider, models]) => {
    const auth = host.modelRuntime.getProvider(provider)?.auth
    return { provider, name: auth?.oauth?.name ?? auth?.apiKey?.name ?? provider, models }
  })
}

const same = (a: Preset, b: Preset) => {
  const canonical = (value: unknown): unknown =>
    isObject(value)
      ? Object.fromEntries(
          Object.keys(value)
            .toSorted()
            .map((key) => [key, canonical(value[key])]),
        )
      : value
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

export async function presetsView(host: ExtensionHost): Promise<PresetsView> {
  const stored = await readStored(presetsPath(host.userHome))
  const current = await capture(host).catch(meansNone)
  const { definitions } = await discoverAgents(
    host.ultimateRoot,
    host.projectRoot,
    host.userHome,
    host.modelRuntime,
  )
  const available = await availableModels(host)
  const presets: PresetView[] = Object.entries(stored.presets)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, preset]) => ({
      name,
      preset,
      current: !!current && same(preset, current),
      missing: missingLogins(host, preset, available),
      orphans: definitions
        .filter(
          (definition) =>
            !definition.model &&
            definition.family &&
            definition.family !== DEFAULT_FAMILY &&
            !Object.hasOwn(preset.families, definition.family),
        )
        .map((definition) => ({ agent: definition.name, family: definition.family! })),
    }))
  return { presets }
}

export async function savePreset(host: ExtensionHost, name: unknown, preset?: unknown) {
  const checked = checkName(name)
  const value = preset === undefined ? await capture(host) : parsePreset(preset)
  await updateJson(presetsPath(host.userHome), readStored, (stored) => {
    if (
      !Object.hasOwn(stored.presets, checked) &&
      Object.keys(stored.presets).length >= MAX_PRESETS
    )
      throw new Error(`At most ${MAX_PRESETS} presets; delete one first`)
    stored.presets[checked] = value
  })
  return null
}

export async function deletePreset(host: ExtensionHost, name: unknown) {
  const checked = checkName(name)
  await updateJson(presetsPath(host.userHome), readStored, (stored) => {
    if (!Object.hasOwn(stored.presets, checked)) throw new Error(`No preset ${checked}`)
    delete stored.presets[checked]
  })
  return null
}

export async function applyPreset(host: ExtensionHost, name: unknown) {
  const checked = checkName(name)
  const stored = await readStored(presetsPath(host.userHome))
  if (!Object.hasOwn(stored.presets, checked)) throw new Error(`No preset ${checked}`)
  const preset = stored.presets[checked]
  const missing = missingLogins(host, preset, await availableModels(host))
  if (missing.length)
    throw new Error(
      `${checked} needs a login first: ${missing
        .map(({ name: provider, models }) => `${provider} (${models.join(', ')})`)
        .join('; ')}`,
    )
  const layers = await readFamilyLayers(
    host.userHome,
    host.projectRoot,
    await host.projectSettings(),
  )
  const { base, from, project } = layers
  const ownPlan = from === 'project' ? base.assign.automaticPlan : undefined
  const plan = ownPlan ?? project.assign.automaticPlan
  const families = { ...preset.families }
  if (plan && plan !== 'off') {
    delete families[plan]
    if (from === 'project' && base.families[plan]) {
      const original = base.families[plan]
      families[plan] = { ...original, color: original.color ?? 'sky' }
    }
  }
  await saveFamilies(host, {
    families,
    assign: { ...preset.assign, ...(ownPlan ? { automaticPlan: ownPlan } : {}) },
    unpin: [],
  })
  await updateSettings(userSettingsPath(host.userHome), (settings) => {
    if (preset.pins.summaries === undefined) delete settings.summaryModel
    else settings.summaryModel = preset.pins.summaries
    const instance = isObject(settings.instance) ? settings.instance : {}
    if (preset.pins.preview === undefined) delete instance.model
    else instance.model = preset.pins.preview
    if (Object.keys(instance).length) settings.instance = instance
    else delete settings.instance
  })
  return null
}
