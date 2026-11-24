import { defineTask } from '@earendil-works/pi-durable'
import type { ConversationId, JsonObject } from '@earendil-works/pi-durable'

type Delivery = {
  to: ConversationId
  type: 'input' | 'write'
  requestId: string
  kind: 'dream.requested' | 'dream.ready' | 'dream.prepared' | 'dream.chapter'
  data?: JsonObject
  content: string
}

export const LegacyDelivery = defineTask<Delivery, { phase: 'submit' }, null>({
  name: 'dream.deliver',
  version: 2,
  migrate: (input) => {
    const { session, ...rest } = input as Omit<Delivery, 'requestId'> & { session: number }
    return {
      input: { ...rest, requestId: `${rest.kind}:${session}` },
      checkpoint: { phase: 'submit' },
    }
  },
  initial: () => ({ phase: 'submit' }),
  phases: {
    submit: async ({ input: { to, type, requestId, kind, data = {}, content } }, runtime, ctx) => {
      const conversation = (await runtime.conversation(to, ctx))!
      await runtime.commit(async (tx) => {
        await conversation.submit(
          tx,
          type === 'input'
            ? { type, requestId, content, entry: { kind, data }, whenBusy: 'followUp' }
            : {
                type,
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
