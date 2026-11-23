import { join } from 'node:path'
import { clampThinkingLevel } from '@earendil-works/pi-ai'
import { mergeLayers, readFamilyLayers } from '../../lib/families-settings.ts'
import { refOf } from '../../lib/families.ts'
import { settled } from '../../lib/errors.ts'
import { readJson, writeJson } from '../../lib/json-file.ts'
import { projectDecision } from '../../lib/project-setup.ts'
import { readSettings } from '../../lib/settings.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import type { PlanSelection } from './refs.ts'

type PlanLink = { family: string | null; revision: number }
const path = (host: ExtensionHost) => join(host.home, 'automatic-plan.json')
export const readPlanLink = (host: ExtensionHost) =>
  readJson<PlanLink>(path(host), { family: null, revision: 0 })
export const linkedFamily = async (host: ExtensionHost) => (await readPlanLink(host)).family

const lockKey = Symbol.for('ultimate.automatic-plan.link-writes')
const processState = globalThis as typeof globalThis & { [lockKey]?: Map<string, Promise<unknown>> }
const writes = (processState[lockKey] ??= new Map())
async function serializeProjectLink<T>(host: ExtensionHost, change: () => Promise<T>) {
  const file = path(host)
  const previous = writes.get(file)
  const current = settled(previous ?? Promise.resolve()).then(change)
  writes.set(file, current)
  try {
    return await current
  } finally {
    if (writes.get(file) === current) writes.delete(file)
  }
}

export function admitWithPlanLink<T>(
  host: ExtensionHost,
  revision: number,
  admit: () => Promise<T>,
) {
  return serializeProjectLink(host, async () =>
    (await readPlanLink(host)).revision === revision ? admit() : undefined,
  )
}

export async function planOptions(host: ExtensionHost): Promise<PlanSelection[]> {
  const project =
    projectDecision(host.projectRoot, host.userHome) === true
      ? await readSettings(join(host.projectRoot, '.ultimate/settings.json'))
      : {}
  const layers = await readFamilyLayers(host.userHome, host.projectRoot, project, false)
  if (layers.errors.length) throw new Error('Fix model family settings before using Automatic Plan')
  const { families } = mergeLayers(layers)
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
  const previous = family === null ? undefined : (await readPlanLink(host)).revision
  if (family && projectDecision(host.projectRoot, host.userHome) !== true)
    throw new Error('Enable project-local setup before turning on Automatic Plan')
  if (family && !(await planOptions(host)).some((option) => option.family === family))
    throw new Error(
      'That family is missing or its model is unavailable. No replacement was selected.',
    )
  await serializeProjectLink(host, async () => {
    const stored = await readPlanLink(host)
    if (previous !== undefined && stored.revision !== previous)
      throw new Error('The Plan setting changed. Choose again to enable it.')
    await writeJson(path(host), { family, revision: stored.revision + 1 })
  })
}
