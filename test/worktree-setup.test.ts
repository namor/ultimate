import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { projectKey } from '../lib/families-settings.ts'
import { writeJson } from '../lib/json-file.ts'
import { userSettingsPath } from '../lib/settings.ts'
import { readWorktreeSetup } from '../lib/worktree-setup.ts'
import { removeTemps, temp } from './helpers.ts'

afterEach(removeTemps)

it('replaces project commands with a fresh personal entry, including an empty list', async () => {
  const userHome = await temp('ultimate-worktree-setup-')
  const projectRoot = await temp('ultimate-worktree-project-')
  const projectSettings = vi.fn<Parameters<typeof readWorktreeSetup>[2]>(async () => ({
    isolates: { worktree: { setup: ['project'] } },
  }))
  const read = () => readWorktreeSetup(userHome, projectRoot, projectSettings)
  const save = (commands: string[]) =>
    writeJson(userSettingsPath(userHome), {
      worktreeSetup: { [projectKey(projectRoot)]: commands },
    })

  expect(await read()).toEqual(['project'])
  await save(['personal'])
  expect(await read()).toEqual(['personal'])
  await save([])
  expect(await read()).toEqual([])
  expect(projectSettings).toHaveBeenCalledTimes(1)
})

it('uses only the selected project entry, with no global command fallback', async () => {
  const userHome = await temp('ultimate-worktree-setup-')
  const projectRoot = await temp('ultimate-worktree-project-')
  await writeJson(userSettingsPath(userHome), {
    isolates: { worktree: { setup: ['not a global fallback'] } },
    worktreeSetup: { [join(projectRoot, 'other-project')]: 'unrelated invalid entry' },
  })
  expect(await readWorktreeSetup(userHome, projectRoot, async () => ({}))).toEqual([])
  expect(
    await readWorktreeSetup(userHome, projectRoot, async () => ({
      isolates: { worktree: { setup: ['project'] } },
    })),
  ).toEqual(['project'])
})
