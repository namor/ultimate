import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux'
import { ProjectTrustStore } from '@earendil-works/pi-coding-agent'
import { expect, test } from 'vitest'
import type { ExtensionHost } from '../../../server/extensions.ts'
import { writeFamilies } from '../../../lib/families-settings.ts'
import { applyPreset, savePreset } from '../../models/presets.ts'
import { temp } from '../../../test/helpers.ts'
import { linkedFamily, linkPlan, planOptions } from '../settings.ts'

test('live family changes guide new plans, but preset apply cannot resurrect Off', async () => {
  const home = await temp('plan-link')
  const projectRoot = join(home, 'project')
  const userHome = join(home, 'user')
  await mkdir(projectRoot)
  await mkdir(join(userHome, '.ultimate'), { recursive: true })
  new ProjectTrustStore(join(userHome, '.ultimate')).set(projectRoot, true)
  const faux = fauxProvider({
    api: 'openai-codex-responses',
    provider: 'plan-fixture',
    models: [
      { id: 'astra', reasoning: true },
      { id: 'sol', reasoning: true },
    ],
  })
  let held: Promise<void> | undefined
  const entered = Promise.withResolvers<void>()
  const reopen = () =>
    ({
      userHome,
      projectRoot,
      ultimateRoot: projectRoot,
      projectSettings: async () => ({}),
      modelRuntime: {
        getAvailableSnapshot: () => faux.models,
        getAvailable: async () => {
          if (held) {
            entered.resolve()
            await held
          }
          return faux.models
        },
        getProvider: () => undefined,
      },
    }) as unknown as ExtensionHost
  const first = reopen()
  const families = (plan: string, other = 'sol') => ({
    families: {
      plan: { model: `plan-fixture/${plan}`, thinking: 'low' },
      default: { model: `plan-fixture/${other}` },
      fast: { model: 'plan-fixture/sol' },
      tiny: { model: 'plan-fixture/sol' },
      review: { model: 'plan-fixture/sol' },
      design: { model: 'plan-fixture/sol' },
    },
  })
  await writeFamilies(userHome, projectRoot, families('astra'))
  await linkPlan(first, 'plan')
  await savePreset(first, 'Unrelated', families('astra', 'astra'))
  await savePreset(first, 'Linked', families('sol'))
  const selected = async (host: ExtensionHost) =>
    (await planOptions(host)).find((option) => option.family === 'plan')
  expect(await selected(first)).toMatchObject({ id: 'astra', effort: 'low' })
  await applyPreset(first, 'Unrelated')
  expect(await selected(first)).toMatchObject({ id: 'astra', effort: 'low' })
  await applyPreset(first, 'Linked')
  expect(await selected(first)).toMatchObject({ id: 'sol', effort: 'low' })
  const release = Promise.withResolvers<void>()
  held = release.promise
  const applying = applyPreset(first, 'Unrelated')
  try {
    await entered.promise
    await linkPlan(first, null)
    expect(await linkedFamily(first)).toBeNull()
  } finally {
    release.resolve()
    await applying
  }
  expect(await linkedFamily(reopen())).toBeNull()
  expect(await selected(reopen())).toMatchObject({ id: 'astra', effort: 'low' })
})
