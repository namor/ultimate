import type { JsonObject } from '@earendil-works/pi-durable'
import { projectKey } from '../../lib/families-settings.ts'
import { readSettings, userSettingsPath } from '../../lib/settings.ts'

export type DeliverySettings = {
  repository: string
  remote: string
  base: string
  checks: string[]
  requiredChecks: string[]
}

/** Personal opt-in only: declined project resources stay declined. */
export async function deliverySettings(
  userHome: string,
  source: string,
): Promise<DeliverySettings | false | undefined> {
  let personal: JsonObject
  try {
    personal = await readSettings(userSettingsPath(userHome))
  } catch {
    // Settings errors can include contents; never expose them in a delivery report.
    throw new Error('Cannot read personal delivery settings')
  }
  const map = personal.delivery
  if (map === undefined) return undefined
  if (!map || typeof map !== 'object' || Array.isArray(map))
    throw new Error('Personal delivery must be keyed by project path')
  const value = map[projectKey(source)]
  if (value === undefined) return undefined
  if (value === false) return false
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid personal delivery entry')
  const { repository, remote, base, checks, requiredChecks } = value
  const nonemptyStrings = (items: unknown): items is string[] =>
    Array.isArray(items) &&
    items.length > 0 &&
    items.every((item) => typeof item === 'string' && item.trim().length > 0)
  if (
    typeof repository !== 'string' ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    typeof remote !== 'string' ||
    !/^[\w.-]+$/.test(remote) ||
    typeof base !== 'string' ||
    !/^[\w./-]+$/.test(base) ||
    !nonemptyStrings(checks) ||
    !nonemptyStrings(requiredChecks)
  )
    throw new Error(
      'Delivery requires an explicit repository, remote, base, local checks and required GitHub checks',
    )
  return { repository, remote, base, checks, requiredChecks }
}
