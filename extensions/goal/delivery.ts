import { defineTask } from '@earendil-works/pi-durable'
import type { ConversationId } from '@earendil-works/pi-durable'

type Card = {
  to: ConversationId
  goal: number
  kind: 'goal.started' | 'goal.report'
  content: string
}

export const LegacyDelivery = defineTask<Card, { phase: 'submit' }, null>({
  name: 'goal.deliver',
  version: 1,
  initial: () => ({ phase: 'submit' }),
  phases: {
    submit: async ({ input: { to, goal, kind, content } }, runtime, ctx) => {
      const requestId = `${kind}:${goal}`
      const data = { goal }
      const conversation = (await runtime.conversation(to, ctx))!
      await runtime.commit(async (tx) => {
        await conversation.submit(
          tx,
          kind === 'goal.started'
            ? { type: 'input', requestId, content, entry: { kind, data }, whenBusy: 'followUp' }
            : {
                type: 'write',
                requestId,
                entry: { kind, data, model: [{ role: 'user', content, timestamp: Date.now() }] },
              },
        )
        return { status: 'terminal', outcome: { status: 'completed', result: null } }
      }, ctx)
    },
  },
  abort: (_task, runtime, ctx) =>
    runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), ctx),
})
