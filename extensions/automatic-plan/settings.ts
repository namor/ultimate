import { join } from 'node:path'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { defineDoc, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import { clampThinkingLevel } from '@earendil-works/pi-ai'
import { mergeLayers, readFamilyLayers } from '../../lib/families-settings.ts'
import { refOf } from '../../lib/families.ts'
import { projectDecision } from '../../lib/project-setup.ts'
import { readSettings } from '../../lib/settings.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import type { PlanSelection } from './refs.ts'

const PlanLink = defineDoc<{ family: string | null; revision: number }>({
  kind: 'automatic-plan.link',
  scope: 'conversation',
  version: 1,
  history: 'latest',
  fork: 'initial',
  checkpointWhen: () => false,
  initial: () => ({ family: null, revision: 0 }),
})
const readLink = (host: ExtensionHost) =>
  host.harness().snapshot(PlanLink, ROOT_CONVERSATION_ID, context)
export async function linkedFamily(host: ExtensionHost) {
  return (await readLink(host))?.family ?? null
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
  const previous = family === null ? undefined : ((await readLink(host))?.revision ?? 0)
  if (family && projectDecision(host.projectRoot, host.userHome) !== true)
    throw new Error('Enable project-local setup before turning on Automatic Plan')
  if (family && !(await planOptions(host)).some((option) => option.family === family))
    throw new Error(
      'That family is missing or its model is unavailable. No replacement was selected.',
    )
  await host.harness().commit(async (tx) => {
    const stored = await tx.doc(PlanLink, ROOT_CONVERSATION_ID)
    if (previous !== undefined && stored.revision !== previous)
      throw new Error('The Plan setting changed. Choose again to enable it.')
    stored.family = family
    stored.revision++
  }, context)
}
