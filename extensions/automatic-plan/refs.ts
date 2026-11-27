/** Plan cards, their protected planning thread, and explicit follow-up actions. */
import type { ModelThinkingLevel } from '@earendil-works/pi-ai'
import type { ConversationId } from '@earendil-works/pi-durable'
import { defineEntry } from '@earendil-works/pi-durable'
import { actionRef } from '../../shared/extension-api.ts'
import { defineEvent } from '../../shared/events.ts'

export type PlanSelection = {
  family: string
  provider: string
  id: string
  effort: ModelThinkingLevel
}
/** Read the project's linked family and the eligible family choices. */
export const PlanSettings = actionRef<
  null,
  { family: string | null; options: PlanSelection[]; problem?: string }
>('automatic-plan', 'settings')
/** Link Automatic Plan to one model family in this project, or turn planning off. Person-only. */
export const SetPlan = actionRef<string | null, null>('automatic-plan', 'setPlan')

export type PlanTurn = {
  prompt?: string
  answer?: string
  error?: string
  input?: number
  output?: number
}
export type Thread = {
  coordinator?: ConversationId
  model?: string
  effort?: ModelThinkingLevel
  turns: PlanTurn[]
  sent?: number
  sending?: number
}
/** Read one protected planning thread. User-only and excluded from trace contents. */
export const ReadThread = actionRef<{ fork: number }, Thread>('automatic-plan', 'readThread')
/** Refresh a protected thread after a turn settles. Carries no thread contents. */
export const PlanningThreadChanged = defineEvent<{ fork: ConversationId }>(
  'automatic-plan.thread-changed',
)
/** The first plan and its link to the original planning fork. */
export const PlanCard = defineEntry<{ fork: ConversationId; text: string }>('automatic-plan.result')
/** An explicit user-selected revision, delivered to the originating coordinator. */
export const RevisionCard = defineEntry<{ fork: ConversationId; revision: number; text: string }>(
  'automatic-plan.revision',
)
/** Ask for a refinement in this fork, provided the shown turn count still matches. User-only. */
export const Refine = actionRef<{ fork: number; after: number; text: string }, null>(
  'automatic-plan',
  'refine',
)
/** Send the displayed completed revision to its original coordinator once. User-only. */
export const SendRevision = actionRef<{ fork: number; revision: number }, null>(
  'automatic-plan',
  'sendRevision',
)
