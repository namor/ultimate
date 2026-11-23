import { join } from 'node:path'
import { clampThinkingLevel } from '@earendil-works/pi-ai'
import { mergeLayers, projectKey, readFamilyLayers } from '../../lib/families-settings.ts'
import { refOf } from '../../lib/families.ts'
import { readJson, updateJson } from '../../lib/json-file.ts'
import { projectDecision } from '../../lib/project-setup.ts'
import { readSettings } from '../../lib/settings.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import type { PlanSelection } from './refs.ts'

const path = (host: ExtensionHost) => join(host.userHome, '.ultimate/automatic-plan.json')
const selections = (file: string) => readJson<Record<string, string | null>>(file, {})
export async function linkedFamily(host: ExtensionHost) {
  const family = (await selections(path(host)))[projectKey(host.projectRoot)]
  if (family === undefined || family === null) return null
  if (typeof family !== 'string' || !family) throw new Error('Invalid Automatic Plan family link')
  return family
}

export async function planOptions(host: ExtensionHost): Promise<PlanSelection[]> {
  const project =
    projectDecision(host.projectRoot, host.userHome) === true
      ? await readSettings(join(host.projectRoot, '.ultimate/settings.json'))
      : {}
  const layers = await readFamilyLayers(host.userHome, host.projectRoot, project)
  if (layers.errors.length) throw new Error('Fix model family settings before using Automatic Plan')
  const { families } = mergeLayers(
    layers.from === 'recent' ? { ...layers, base: { families: {}, assign: {} } } : layers,
  )
  const available = host.modelRuntime.getAvailableSnapshot()
  return Object.entries(families).flatMap(([family, spec]) => {
    const ref = refOf(spec.model)
    const model = available.find(
      (entry) =>
        entry.api === 'openai-codex-responses' &&
        entry.provider === ref?.provider &&
        entry.id === ref.modelId,
    )
    const effort = spec.thinking ?? 'low'
    return model && clampThinkingLevel(model, effort) === effort
      ? [{ family, provider: model.provider, id: model.id, effort }]
      : []
  })
}

export async function linkPlan(host: ExtensionHost, family: string | null) {
  if (family && projectDecision(host.projectRoot, host.userHome) !== true)
    throw new Error('Enable project-local setup before turning on Automatic Plan')
  if (family && !(await planOptions(host)).some((option) => option.family === family))
    throw new Error(
      'That family is missing or its model is unavailable. No replacement was selected.',
    )
  await updateJson(path(host), selections, (stored) => {
    stored[projectKey(host.projectRoot)] = family
  })
}
