import { askedUnderStanding, waits } from './delivery.ts'
import type { Delivery } from './delivery.ts'
import type { StandingGrant } from './types.ts'

export function deliveryAsk(
  delivery: Delivery | undefined,
  standing?: StandingGrant,
  now = Date.now(),
) {
  const wait = delivery && waits(delivery)
  if (wait?.on === 'user') return 'recheck'
  if (wait?.on !== 'publish' && wait?.on !== 'merge') return undefined
  return askedUnderStanding(delivery!, wait.on, standing, now) ? undefined : wait.on
}
