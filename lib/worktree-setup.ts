import type { JsonObject } from '@earendil-works/pi-durable'
import { projectKey } from './families-settings.ts'
import { readSettings, userSettingsPath } from './settings.ts'

/** Personal commands replace setup only for this project's main checkout; otherwise use gated project settings. */
export async function readWorktreeSetup(
  userHome: string,
  projectRoot: string,
  projectSettings: () => Promise<JsonObject>,
): Promise<string[]> {
  let personal: JsonObject
  try {
    personal = await readSettings(userSettingsPath(userHome))
  } catch {
    // JSON parser and filesystem errors can include settings contents; report only the relevant source.
    throw new Error('Cannot read personal worktree setup settings')
  }
  const map = personal.worktreeSetup
  if (map !== undefined) {
    if (!map || typeof map !== 'object' || Array.isArray(map))
      throw new Error('Personal worktreeSetup must be an object keyed by project path')
    const key = projectKey(projectRoot)
    if (Object.hasOwn(map, key)) {
      const commands = map[key]
      if (!Array.isArray(commands) || !commands.every((command) => typeof command === 'string'))
        throw new Error('Personal worktreeSetup entry must be an array of command strings')
      return commands
    }
  }
  const commands =
    ((await projectSettings()) as { isolates?: { worktree?: { setup?: unknown } } }).isolates
      ?.worktree?.setup ?? []
  if (!Array.isArray(commands) || !commands.every((command) => typeof command === 'string'))
    throw new Error('isolates.worktree.setup must be an array of command strings')
  return commands
}
