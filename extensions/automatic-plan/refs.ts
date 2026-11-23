/** Plan cards, their protected planning thread, and explicit follow-up actions. */
import type { ConversationId } from '@earendil-works/pi-durable'
import { defineEntry } from '@earendil-works/pi-durable'
import { actionRef, docRef } from '../../shared/extension-api.ts'

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
  effort?: string
  turns: PlanTurn[]
  sent?: number
  sending?: number
}
/** The isolated planning turns stored on the sealed fork. */
export const ThreadDoc = docRef<Thread>('automatic-plan.thread')
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
