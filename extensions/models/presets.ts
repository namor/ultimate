/**
 * Model presets: named snapshots of the personal model families (models, thinking, colors, feature assignments) and
 * the user-settings pins of features (`summaryModel`, `instance.model`), kept in `~/.ultimate/model-presets.json` to
 * switch between, say, a Claude and a ChatGPT subscription. Applying one saves its families as `saveFamilies` does and
 * sets or clears the pins; conversations started after it use them, open ones keep their model. Applying is refused
 * while a model it names has no login here. Agent definitions are not part of a preset: they keep naming families.
 */
import { join } from 'node:path'
import type { JsonObject } from '@earendil-works/pi-durable'
import type { ExtensionHost } from '../../server/extensions.ts'
import { discoverAgents } from '../../lib/agents.ts'
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

/** A preset name: 1–40 characters, no control characters, no surrounding spaces. */
export function checkName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) throw new Error('A preset needs a name')
  if (name !== name.trim()) throw new Error('A preset name has no surrounding spaces')
  if (name.length > MAX_NAME) throw new Error(`A preset name has at most ${MAX_NAME} characters`)
  // oxlint-disable-next-line no-control-regex -- control characters are what it rejects
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error('A preset name has no control characters')
  return name
}

/** A pin as settings hold it: `provider/id` (summaries may add `:thinking`), or null for off. */
function checkPin(value: unknown, where: string) {
  if (value === null || (typeof value === 'string' && /^[^/\s]+\/\S+$/.test(value))) return value
  throw new Error(`${where} must be "provider/id" or null`)
}

/**
 * One preset, checked and complete: every built-in family is in it, so a preset compares equal to what it was saved
 * from. Throws naming the first invalid field.
 */
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
  // Only features are assigned in families (`saveFamilies`); an older agent assignment means nothing now.
  for (const user of Object.keys(assign)) if (!Object.hasOwn(FEATURES, user)) delete assign[user]
  return { families, assign, pins }
}

/** The presets file, checked whole: a corrupt or newer file throws and is never written over. */
async function readStored(path: string): Promise<Stored> {
  const value = await readJson<unknown>(path, { version: VERSION, presets: {} })
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

/** What applies now: this project's personal families (own or recent, without the team layer) and the user's pins. */
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

/** The models a preset names: each family's, and the pins'. */
const modelsOf = (preset: Preset) => [
  ...new Set(
    [
      ...Object.values(preset.families).map((family) => family.model),
      ...Object.values(preset.pins).map((pin) => pin?.replace(levels, '')),
    ].filter((model): model is string => !!model),
  ),
]

/** The providers without a login here that a preset needs, with the models it names on each. */
async function missingLogins(host: ExtensionHost, preset: Preset) {
  const available = new Set(
    (await host.modelRuntime.getAvailable()).map((model) => `${model.provider}/${model.id}`),
  )
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
  const current = await capture(host).catch(() => {
    // Unreadable families or settings: no preset is marked current; the Agents panel shows the families error.
    return undefined
  })
  const { definitions } = await discoverAgents(
    host.ultimateRoot,
    host.projectRoot,
    host.userHome,
    host.modelRuntime,
  )
  const presets: PresetView[] = await Promise.all(
    Object.entries(stored.presets)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(async ([name, preset]) => ({
        name,
        preset,
        current: !!current && same(preset, current),
        missing: await missingLogins(host, preset),
        // Agents naming a family the preset lacks fall back to the default family once it applies.
        orphans: definitions
          .filter(
            (definition) =>
              !definition.model &&
              definition.family &&
              definition.family !== DEFAULT_FAMILY &&
              !Object.hasOwn(preset.families, definition.family),
          )
          .map((definition) => ({ agent: definition.name, family: definition.family! })),
      })),
  )
  return { presets }
}

/** Save what applies now as `name`, replacing a preset of that name; `preset` saves that instead (checked, not applied). */
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

/**
 * Make preset `name` the personal families and pins. Refused, writing nothing, while a model it names has no login.
 * Two files change: the families first, then the pins in one settings write; applying again completes a half-done one.
 */
export async function applyPreset(host: ExtensionHost, name: unknown) {
  const checked = checkName(name)
  const stored = await readStored(presetsPath(host.userHome))
  if (!Object.hasOwn(stored.presets, checked)) throw new Error(`No preset ${checked}`)
  const preset = stored.presets[checked]
  const missing = await missingLogins(host, preset)
  if (missing.length)
    throw new Error(
      `${checked} needs a login first: ${missing
        .map(({ name: provider, models }) => `${provider} (${models.join(', ')})`)
        .join('; ')}`,
    )
  await saveFamilies(host, { families: preset.families, assign: preset.assign, unpin: [] })
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
