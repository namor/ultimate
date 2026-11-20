import { waits } from './delivery.ts'
import type { Delivery } from './delivery.ts'

export function deliveryAsk(delivery: Delivery | undefined) {
  const wait = delivery && waits(delivery)
  if (wait?.on === 'user') return 'recheck'
  if (wait?.on === 'publish' || wait?.on === 'merge') return wait.on
  return undefined
}
