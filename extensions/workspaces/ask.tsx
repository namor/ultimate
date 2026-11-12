import type { Delivery } from './delivery.ts'

/**
 * What a delivery asks of the user, if anything: approve publishing a high-risk candidate, approve merging a medium or
 * high one, or recheck a blocked one. Only the user can give these, on the delivery's card.
 */
export function deliveryAsk(delivery: Delivery | undefined) {
  if (delivery?.stage === 'blocked') return 'recheck'
  if (delivery?.stage === 'publish' && delivery.risk === 'high' && !delivery.publishApproved)
    return 'publish'
  if (delivery?.stage === 'merge' && delivery.risk !== 'low' && !delivery.mergeApproved)
    return 'merge'
  return undefined
}
