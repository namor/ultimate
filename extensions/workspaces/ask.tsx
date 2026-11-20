import type { Delivery } from './delivery.ts'

/**
 * What a delivery asks of the user, if anything: approve publishing a high-risk candidate, approve merging a medium or
 * high one, or recheck a blocked one. A block its branch was woken to repair is not the user's yet (#53902); the card
 * still offers Recheck and Stop for it.
 */
export function deliveryAsk(delivery: Delivery | undefined) {
  if (delivery?.stage === 'blocked') return delivery.wake?.to === 'branch' ? undefined : 'recheck'
  if (delivery?.stage === 'publish' && delivery.risk === 'high' && !delivery.publishApproved)
    return 'publish'
  if (delivery?.stage === 'merge' && delivery.risk !== 'low' && !delivery.mergeApproved)
    return 'merge'
  return undefined
}
