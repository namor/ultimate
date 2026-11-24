import type { ConversationId, EntryId, TaskId } from '@earendil-works/pi-durable'
import type { ConversationSubject } from '../conversations/types.ts'
import type { Approval, Delivery, DeliveryRisk } from './delivery.ts'
import type { DeliverySettings } from './delivery-settings.ts'
import type { PullRequestCopy } from './pull-request.ts'

export type Workspace = {
  path: string
  branch: string
  base: string
  source: string
  target: string
  state: 'preparing' | 'ready' | 'failed' | 'removed'
  error?: string
  landed?: string
  deliveryWakes?: number
}
type SubmitTimeEntryId = EntryId
type SubmitTimeSubject = ConversationSubject
type CheckCommand = string
type LastOutputLine = string
type TargetTipBeforeLanding = string
type PushedRemoteBranch = string
type OutputTail = string
type UnixMilliseconds = number

export type QueueEntry = {
  id: string
  conversationId: ConversationId
  source: string
  target: string
  tip: string
  at: SubmitTimeEntryId
  divergence: string
  state: 'queued' | 'landing' | 'waiting'
  assessment?: {
    risk: DeliveryRisk
    review: string
    reviewedTree: string
    pullRequest?: PullRequestCopy
  }
  delivery?: Delivery
  deliveryConfig?: DeliverySettings | false
  subject?: SubmitTimeSubject
  step?: string
  steps: LanderStep[]
  landed?: Landed
  rebuilds?: number
  approvals?: Approval[]
}
export type Landed = {
  sha: string
  base: TargetTipBeforeLanding
  commits: string[]
  paths: string[]
  flaky: string[]
  weight?: Weight
}
export type Weight = { added: number; removed: number; tokens: number }
export type LanderCheck = {
  command: CheckCommand
  result: 'passed' | 'failed' | 'flaky'
  summary?: LastOutputLine
}
export type LanderStep = {
  step: string
  at: UnixMilliseconds
  runs?: CheckCommand
  check?: LanderCheck
}
export type LanderOutcome = {
  delivery?: Delivery
  outcome: 'landed' | 'failed'
  divergence?: string
  sha?: string
  base?: TargetTipBeforeLanding
  commits?: string[]
  paths?: string[]
  flaky?: string[]
  weight?: Weight
  pushed?: PushedRemoteBranch
  pr?: string
  needsRestart?: boolean
  reason?: string
  output?: OutputTail
  hint?: string
}
export type LanderEntry = {
  submission: string
  conversationId: ConversationId
  tip: string
  target: string
  at: UnixMilliseconds
  sourceEntry?: SubmitTimeEntryId
  step?: string
  runs?: string
  check?: LanderCheck
  subject?: SubmitTimeSubject
} & Partial<LanderOutcome>
type SourceCheckout = string

export type WorkspaceIndex = {
  items: Record<string, Workspace>
  queue: QueueEntry[]
  landers: Record<SourceCheckout, TaskId>
  landerConversations: Record<SourceCheckout, ConversationId>
  closing?: {
    source: SourceCheckout
    repository: string
    pr: number
    note: string
    tries?: number
  }[]
  standing?: StandingGrant
  instructionFloor?: number
  results: Record<
    string,
    LanderOutcome & {
      target: string
      tip: string
      lander: ConversationId
      steps: LanderStep[]
      conversationId?: ConversationId
      subject?: SubmitTimeSubject
      at: SubmitTimeEntryId
      divergence: string
      approvals?: Approval[]
    }
  >
}
export type WorkspaceInfo = Workspace & {
  ahead: number | null
  tip: string | null
  sourceTip: string | null
  currentBranch: string | null
  sourceBranch: string | null
}
export type WorkspaceStats = Record<Workspace['state'], number> & {
  total: number
  landed: number
  ahead: number
  fresh: number
  dirty: number
}
type AllocatedBytes = number
type BtrfsBytesCountingSharedOnce = number
export type WorkspaceDisk = {
  bytes: AllocatedBytes | null
  real: BtrfsBytesCountingSharedOnce | null
  at: UnixMilliseconds
}
export type LandResult = {
  text: string
  landed?: string
  commits?: string[]
  paths?: string[]
  files?: { path: string; added: number; removed: number }[]
  needsRestart?: boolean
}
export type SubmitResult = { text: string; id: string; position: number; lander: ConversationId }

export type StandingGrant = {
  instruction: EntryId
  conversation: ConversationId
  at: number
  until: number
  revokedAt?: number
  revokedBy?: 'user' | 'ultimate'
  boundary?: EntryId
}

type LowercasedGithubRepositoryKey = string
type GithubSpellingOrKeyFallback = string
export type GithubRepo = {
  key: LowercasedGithubRepositoryKey
  name: GithubSpellingOrKeyFallback
  url: string
  visibility?: 'public' | 'private' | 'internal'
}
