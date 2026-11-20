import { defineTask, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import type { ConversationDocToken } from '@earendil-works/pi-durable'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import type { ExtensionHost } from '../../server/extensions.ts'
import { AutomationsApi } from '../automations/api.ts'
import type { Automation } from '../automations/refs.ts'
import type { Goal } from './refs.ts'

type Goals = ConversationDocToken<{ next: number; goals: Goal[] }>

export async function retireReminders(host: ExtensionHost, goals: Goals) {
  const state = await host.harness().snapshot(goals, ROOT_CONVERSATION_ID, context)
  if (!state?.goals.length) return
  const automations = host.need(AutomationsApi)
  const list = (await host.invoke(
    'automations',
    'list',
    null,
    new AbortController().signal,
  )) as Automation[]
  for (const item of list) {
    if (
      state.goals.some(
        (goal) => item.id === goal.reminder || item.key === `goal.reminder:${goal.id}`,
      )
    )
      await automations.delete(item.id)
  }
}

export const LegacyReminderTask = defineTask<{ goal: number }, { phase: 'sync' }, null>({
  name: 'goal.reminder',
  version: 1,
  initial: () => ({ phase: 'sync' }),
  phases: {
    sync: (_task, runtime, ctx) =>
      runtime.commit(
        () => ({ status: 'terminal', outcome: { status: 'completed', result: null } }),
        ctx,
      ),
  },
  abort: (_task, runtime, ctx) =>
    runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), ctx),
})
