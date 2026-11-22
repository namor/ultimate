import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { defineDoc, defineTask, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import type { ConversationId, EntryId, Tx } from '@earendil-works/pi-durable'
import type { ExtensionHost } from '../../server/extensions.ts'
import { AutomationsApi, Fired } from '../automations/api.ts'
import { MessagesApi } from '../messages/api.ts'
import { Standing } from '../subagents/api.ts'
import { CheckRan } from '../workspaces/api.ts'

export const reviewId = 'dream.daily.01'
export const ReviewState = defineDoc<{
  schedule?: string
  day?: string
  timeouts?: { submission: string; ref: EntryId }[]
  dismissed?: typeof reviewId
}>({
  kind: 'dream.daily-review',
  checkpointWhen: () => false,
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  initial: () => ({}),
})

export async function reviewQuestion(host: ExtensionHost, tx: Tx, ultimate: ConversationId) {
  const state = await tx.doc(ReviewState, ROOT_CONVERSATION_ID)
  if (!state.schedule) return undefined
  return host.need(MessagesApi).questionReceipt(tx, ultimate, reviewId)
}

export function dailyReview(host: ExtensionHost) {
  const messages = host.need(MessagesApi)
  const send = defineTask<{ from: ConversationId; refs: EntryId[] }, { phase: 'send' }, null>({
    name: 'dream.daily-review.send',
    version: 1,
    initial: () => ({ phase: 'send' }),
    phases: {
      send: async (task, runtime, ctx) => {
        const { from, refs } = task.input
        await messages.ask(
          from,
          `Verification timed out on two separate submissions. Event references: ${refs.join(', ')}.`,
          { kind: 'confirm', text: 'Review recurring verification timeouts?' },
          reviewId,
          ctx,
        )
        await runtime.commit(
          () => ({ status: 'terminal', outcome: { status: 'completed', result: null } }),
          ctx,
        )
      },
    },
    abort: (_task, runtime, ctx) =>
      runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), ctx),
  })
  host.react(
    'daily-review',
    [CheckRan, Fired],
    async (tx, event) => {
      const state = await tx.doc(ReviewState, ROOT_CONVERSATION_ID)
      if (!state.schedule || state.dismissed) return
      if (CheckRan.is(event)) {
        if (event.data.result !== 'timeout' || event.data.submission.length > 128) return
        const timeouts = state.timeouts ?? []
        if (
          timeouts.length < 2 &&
          !timeouts.some((item) => item.submission === event.data.submission)
        )
          state.timeouts = [...timeouts, { submission: event.data.submission, ref: event.id }]
      } else if (Fired.is(event) && event.data.id === state.schedule) {
        const day = event.at.slice(0, 10)
        if (state.day !== undefined && day <= state.day) return
        state.day = day
        const evidence = state.timeouts
        delete state.timeouts
        if (evidence?.length !== 2) return
        const ultimate = (await tx.doc(Standing, ROOT_CONVERSATION_ID)).ultimate
        if (ultimate === undefined || (await reviewQuestion(host, tx, ultimate))) return
        await tx.createTask(
          send,
          { from: ultimate, refs: evidence.map(({ ref }) => ref) },
          {
            conversationId: ROOT_CONVERSATION_ID,
            ownership: { kind: 'conversation' },
            background: true,
          },
        )
      }
    },
    { from: 'now' },
  )
  host.onOpen(async () => {
    const id = await host.need(AutomationsApi).ensureEventSchedule(reviewId, 'Dream daily review', {
      kind: 'cron',
      expr: '0 9 * * *',
      tz: 'UTC',
    })
    await host.harness().commit(async (tx) => {
      ;(await tx.doc(ReviewState, ROOT_CONVERSATION_ID)).schedule = id
    }, context)
  })
  return send
}
