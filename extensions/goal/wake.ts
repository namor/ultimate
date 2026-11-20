import { defineTask, InboxDoc, ROOT_CONVERSATION_ID as ROOT } from '@earendil-works/pi-durable'
import type { ConversationId, EntryId, Tx } from '@earendil-works/pi-durable'
import { EVENT_FEED } from '../../shared/events.ts'
import type { EventRecord } from '../../shared/events.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { openQuestion } from '../../lib/message-state.ts'
import { Concluded, ConversationsApi } from '../conversations/api.ts'
import { Messages, MessageSent, MessagesApi } from '../messages/api.ts'
import type { Goal } from './refs.ts'

type Work = { message: number } | { branches: ConversationId[] }
type Wake = { goal: number; event: EntryId; to: ConversationId; work: Work }
const kind = 'goal.wake'
type Active = (tx: Tx) => Promise<{ goal: Goal; to: ConversationId } | undefined>

export async function eventFence(host: Pick<ExtensionHost, 'doc'>, tx: Tx) {
  const feed = host.doc(EVENT_FEED)
  if (!feed) return undefined
  return ((await tx.doc(feed, ROOT)).events as EventRecord[]).at(-1)?.id
}

export async function withdrawWakes(tx: Tx, to: ConversationId, goal: number) {
  const inbox = await tx.doc(InboxDoc, to)
  inbox.items = inbox.items.filter((item) => {
    if (item.mode !== 'followUp' || item.entry?.kind !== kind) return true
    if ((item.entry.data as { goal?: number } | undefined)?.goal !== goal) return true
    tx.settleSubmission(item.id, { status: 'unanswered', reason: 'goal-inactive' })
    return false
  })
}

export function workWakes(host: ExtensionHost, active: Active) {
  const messages = host.need(MessagesApi)
  const conversations = host.need(ConversationsApi)
  const eligible = (goal: Goal, event: EntryId) => event > (goal.afterEvent ?? 0)

  async function describe(tx: Tx, { to, work }: Wake) {
    if ('message' in work) {
      const question = (await tx.doc(Messages, ROOT)).messages.find((m) => m.id === work.message)
      if (
        question &&
        openQuestion(question) &&
        typeof question.from === 'number' &&
        (await messages.starterIn(tx, question.from)) === to
      )
        return `Branch #${question.from} is waiting on the user for question ${question.id}. Check whether the hands-off goal can proceed without a user decision.`
      return undefined
    }
    const concluded = await conversations.concludedIn(tx)
    const branches = []
    for (const id of work.branches)
      if (concluded.has(id) && (await messages.starterIn(tx, id)) === to) branches.push(`#${id}`)
    return branches.length
      ? `Branch work was concluded: ${branches.join(', ')}. Check what this means for the hands-off goal.`
      : undefined
  }

  const WakeTask = defineTask<Wake, { phase: 'submit' }, null>({
    name: kind,
    version: 1,
    initial: () => ({ phase: 'submit' }),
    phases: {
      submit: async ({ input }, runtime, ctx) => {
        const target = await runtime.conversation(input.to, ctx)
        await runtime.commit(async (tx) => {
          const current = await active(tx)
          if (
            target &&
            current?.to === input.to &&
            current.goal.id === input.goal &&
            eligible(current.goal, input.event)
          ) {
            const content = await describe(tx, input)
            if (content)
              await target.submit(tx, {
                type: 'input',
                whenBusy: 'followUp',
                content,
                requestId: `${kind}:${input.goal}:${input.event}`,
                entry: { kind, data: { goal: input.goal } },
              })
          }
          return { status: 'terminal', outcome: { status: 'completed', result: null } }
        }, ctx)
      },
    },
    abort: (_task, runtime, ctx) =>
      runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), ctx),
  })
  host.react(
    'work-wakes',
    [MessageSent, Concluded],
    async (tx, event) => {
      const current = await active(tx)
      if (!current || !eligible(current.goal, event.id)) return
      const data = event.data
      let work: Work
      if ('message' in data) {
        if (data.to !== 'user' || !data.reply) return
        work = { message: data.message }
      } else {
        if (data.by === 'landing' || data.by === current.to || !data.newlyConcluded?.length) return
        work = { branches: data.newlyConcluded }
      }
      const wake = { to: current.to, goal: current.goal.id, event: event.id, work }
      if (await describe(tx, wake))
        await tx.createTask(WakeTask, wake, {
          conversationId: current.to,
          ownership: { kind: 'conversation' },
          background: true,
        })
    },
    { from: 'now' },
  )
  return WakeTask
}
