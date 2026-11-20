import type { Delivery } from './delivery.ts'

export function deliveryAsk(delivery: Delivery | undefined) {
  if (delivery?.stage === 'blocked') return 'recheck'
  if (delivery?.stage === 'publish' && delivery.risk === 'high' && !delivery.publishApproved)
    return 'publish'
  if (delivery?.stage === 'merge' && delivery.risk !== 'low' && !delivery.mergeApproved)
    return 'merge'
  return undefined
}
