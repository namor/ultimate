import type { ConversationId, EntryId } from '@earendil-works/pi-durable'
import type { DeliverySettings } from './delivery-settings.ts'
import type { PullRequestCopy } from './pull-request.ts'
import type { QueueEntry, StandingGrant } from './types.ts'

export type DeliveryRisk = 'low' | 'medium' | 'high'
export type Stage = 'review' | 'publish' | 'pr' | 'ci' | 'merge' | 'merged' | 'closed' | 'blocked'
export type Cause =
  | 'check-failed'
  | 'infra'
  | 'closed'
  | 'runtime'
  | 'github'
  | 'uncertain-write'
  | 'auth'
  | 'safety'
  | 'stale'
export type Decision = { at: number; what: string; why?: string }
export type Delivery = {
  settings: DeliverySettings
  risk: DeliveryRisk
  review: string
  baseline: string
  candidate: string
  tree: string
  branch: string
  checkedAt: number
  runtime: string
  stage: Stage
  slot?: boolean
  asked?: string
  since?: number
  pollAt?: number
  pullRequest?: PullRequestCopy
  published?: boolean
  publishIntent?: boolean
  createIntent?: boolean
  mergeIntent?: boolean
  pr?: number
  url?: string
  merged?: string
  observedMerge?: { targetTip: string; parent: string }
  publishApproved?: boolean
  mergeApproved?: boolean
  approvals?: Approval[]
  reason?: string
  cause?: Cause
  resumeStage?: Exclude<Stage, 'blocked'>
  rerun?: boolean
  rerunAt?: number
  reruns?: number
  cancelled?: number
  blocks?: number
  wake?: { block: number; to: 'branch' | 'ultimate' | 'user'; why?: string }
  decisions?: Decision[]
}
export type Approval = {
  action: 'approve-pr' | 'publish' | 'merge' | 'recheck' | 'stop'
  at: number
  by: 'user' | 'ultimate' | 'agent'
  candidate?: string
  conversation?: ConversationId
  instruction?: EntryId
  standing?: EntryId
  reason?: string
}
export type Wait = {
  on: 'review' | 'publish' | 'merge' | 'repair' | 'ultimate' | 'user'
  why?: string
}
export type Actor =
  | { by: 'user' }
  | { by: 'ultimate'; instruction: true }
  | { by: 'ultimate'; standing: StandingGrant | undefined }
  | { by: 'agent'; conversation: number; submitter: number; ultimate: number | undefined }

export const POLL_MS = 30_000
export const CI_LIMIT_MS = 60 * 60_000
export const MAX_RERUNS = 2
export const MAX_REBUILDS = 3
export const AGENT_RECHECKS = 3
export const BRANCH_WAKES = 3

export const uncertainWrite = (d: Delivery) =>
  Boolean((d.publishIntent && !d.published) || (d.createIntent && !d.pr) || d.mergeIntent)

export const spent = (item: {
  delivery?: Pick<Delivery, 'approvals'>
  approvals?: Approval[]
}): Approval[] => [...(item.delivery?.approvals ?? []), ...(item.approvals ?? [])]

export const standingFor = (d: Delivery, action: 'publish' | 'merge') =>
  d.approvals?.findLast((a) => a.action === action || a.action === 'approve-pr')?.standing

export function matchingRefStandingWithdrawn(d: Delivery, grant: StandingGrant | undefined) {
  const stage = d.stage === 'blocked' ? d.resumeStage : d.stage
  if (stage !== 'pr' || !d.publishApproved || d.publishIntent || d.createIntent) return false
  const accepted = standingFor(d, 'publish')
  return (
    accepted !== undefined && (grant?.instruction !== accepted || grant.revokedAt !== undefined)
  )
}

const awaitingPublication = (d: Delivery, stage = d.stage) =>
  d.risk === 'high' &&
  !d.publishApproved &&
  !d.publishIntent &&
  (stage === 'publish' || (stage === 'pr' && !d.createIntent))

export function needsUser(d: Delivery): string | undefined {
  if (uncertainWrite(d)) return 'an uncertain remote write must be reconciled'
  if (d.cause === 'runtime') return undefined
  if (
    (d.resumeStage === 'merge' && d.risk !== 'low' && !d.mergeApproved) ||
    (d.resumeStage !== undefined && awaitingPublication(d, d.resumeStage))
  )
    return 'it waits for your approval'
  if (d.cause === 'auth') return 'GitHub access needs your login or credentials'
  if (d.cause === 'safety') return 'a safety hold needs your decision'
  return undefined
}

export function waits(d: Delivery): Wait | undefined {
  if (d.stage === 'review') return { on: 'review' }
  if (awaitingPublication(d)) return { on: 'publish' }
  if (d.stage === 'merge' && d.risk !== 'low' && !d.mergeApproved) return { on: 'merge' }
  if (d.stage === 'blocked') {
    const why = d.wake?.to === 'user' ? d.wake.why : needsUser(d)
    if (why) return { on: 'user', why }
    return d.wake?.to === 'ultimate' ? { on: 'ultimate' } : { on: 'repair' }
  }
  return undefined
}

export const inFlight = (d: Delivery) => d.slot === true

export const standingAsk = (d: Delivery, action: 'publish' | 'merge', grant: StandingGrant) =>
  `${action}:${d.candidate}:${grant.instruction}`

export const askedUnderStanding = (
  d: Delivery,
  action: 'publish' | 'merge',
  grant: StandingGrant | undefined,
  now: number,
) =>
  grant !== undefined &&
  grant.revokedAt === undefined &&
  now < grant.until &&
  d.asked === standingAsk(d, action, grant)

export function park(entry: Pick<QueueEntry, 'state' | 'delivery'>) {
  const d = entry.delivery
  if (d && waits(d)) {
    entry.state = 'waiting'
    delete d.slot
  } else entry.state = 'queued'
}

export const needsSlot = (
  queue: readonly Pick<QueueEntry, 'delivery' | 'deliveryConfig'>[],
  entry: Pick<QueueEntry, 'delivery' | 'deliveryConfig'>,
) => {
  const d = entry.delivery
  const repository = d?.settings.repository ?? (entry.deliveryConfig || undefined)?.repository
  if (!repository || (d && (waits(d) || d.slot))) return false
  return queue.some(
    (other) =>
      other.delivery &&
      inFlight(other.delivery) &&
      other.delivery.settings.repository === repository,
  )
}

export function pick<E extends Pick<QueueEntry, 'delivery' | 'deliveryConfig'>>(
  queue: readonly E[],
  now: number,
  mine: (entry: E) => boolean = () => true,
): { ready: number } | { until: number } | undefined {
  const flying = new Set(
    queue.flatMap((e) =>
      e.delivery && inFlight(e.delivery) ? [e.delivery.settings.repository] : [],
    ),
  )
  let until: number | undefined
  for (const [position, e] of queue.entries()) {
    if (!mine(e)) continue
    const d = e.delivery
    const repository = d?.settings.repository ?? (e.deliveryConfig || undefined)?.repository
    if (!d) {
      if (!repository || !flying.has(repository)) return { ready: position }
      continue
    }
    if (waits(d)) continue
    if (!d.slot) {
      if (!flying.has(d.settings.repository)) return { ready: position }
      continue
    }
    if ((d.pollAt ?? 0) <= now) return { ready: position }
    until = Math.min(until ?? Infinity, d.pollAt!)
  }
  return until === undefined ? undefined : { until }
}

export const supersedes = (
  older: Pick<QueueEntry, 'conversationId' | 'target' | 'state' | 'delivery'>,
  newer: Pick<QueueEntry, 'conversationId' | 'target'>,
) =>
  older.conversationId === newer.conversationId &&
  older.target === newer.target &&
  older.state !== 'landing' &&
  (!older.delivery ||
    (waits(older.delivery) !== undefined &&
      !uncertainWrite(older.delivery) &&
      older.delivery.cause !== 'safety'))

export function authorize(
  actor: Actor,
  action: Approval['action'],
  d: Delivery,
  state: QueueEntry['state'],
  env: { now: number; runtime: string },
): string | undefined {
  if (actor.by === 'agent') {
    if (actor.conversation !== actor.submitter && actor.conversation !== actor.ultimate)
      return "Only the user or @ultimate on the user's instruction can act on a delivery"
    if (action !== 'recheck' && action !== 'stop')
      return "Agents may only recheck or stop a delivery; publish and merge are the user's"
  }
  if (actor.by === 'ultimate' && 'standing' in actor) {
    const grant = actor.standing
    if (!grant || grant.revokedAt !== undefined) return 'No standing approval is on'
    if (env.now >= grant.until) return 'The standing approval expired'
    if (action !== 'publish' && action !== 'merge')
      return 'A standing approval covers publish and merge only'
    if (d.runtime !== env.runtime)
      return 'Local verification ran on another runtime; verify a new delivery'
    if (d.stage === 'review' || !d.review.trim())
      return 'No independent review covers this exact tree'
    if (uncertainWrite(d)) return 'An uncertain write is pending; reconcile it first'
    if (action === 'merge' && d.stage !== 'merge')
      return 'Required GitHub checks have not passed on this exact head'
    if (action === 'publish' && d.stage !== 'publish' && d.stage !== 'pr')
      return 'Delivery is not awaiting publication'
  }
  if (action === 'approve-pr') {
    if (uncertainWrite(d)) return 'An uncertain write is pending; reconcile it first'
    if (!d.review.trim()) return 'No independent review covers this exact tree'
  }
  if (action === 'approve-pr' || action === 'publish' || action === 'merge') {
    if (d.runtime !== env.runtime)
      return 'Local verification ran on another runtime; verify a new delivery'
    if (waits(d)?.on !== (action === 'approve-pr' ? 'publish' : action))
      return 'Delivery stage changed; reload its card'
  }
  if (action === 'recheck') {
    if (d.stage !== 'blocked' || !d.resumeStage) return 'Delivery stage changed; reload its card'
    if (actor.by === 'agent') {
      const wait = waits(d)
      if (wait?.on === 'user') return `This block needs the user: ${wait.why}`
      if (wait?.on === 'ultimate' && actor.conversation !== actor.ultimate)
        return `This block is @ultimate's to decide after ${BRANCH_WAKES} repair attempts`
      if (
        (d.approvals ?? []).filter(
          (a) => a.by === 'agent' && a.action === 'recheck' && a.candidate === d.candidate,
        ).length >= AGENT_RECHECKS
      )
        return `Agents already rechecked this candidate ${AGENT_RECHECKS} times; stop it, resubmit a repaired candidate, or ask the user`
    }
  }
  if (action === 'stop') {
    if (d.stage === 'merged' || d.stage === 'closed') return 'The PR already has an outcome'
    if (state === 'landing') return 'The lander is working on this delivery; stop it once it parks'
    if (uncertainWrite(d)) return 'Reconcile the uncertain write before stopping this delivery'
    if (actor.by === 'agent' && d.stage !== 'blocked')
      return 'Agents stop only a blocked delivery; resubmit to replace one that waits'
    if (actor.by === 'agent' && waits(d)?.on === 'user')
      return `This block needs the user: ${waits(d)!.why}`
  }
  return undefined
}
