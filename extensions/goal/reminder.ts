import { defineTask, InboxDoc, ROOT_CONVERSATION_ID as ROOT } from '@earendil-works/pi-durable'
import type { ConversationDocToken, Cursor, Tx } from '@earendil-works/pi-durable'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import type { ExtensionHost } from '../../server/extensions.ts'
import { AutomationsApi } from '../automations/api.ts'
import type { Automation } from '../automations/refs.ts'
import { Standing } from '../subagents/api.ts'
import type { Goal } from './refs.ts'

export type GoalState = {
  next: number
  goals: Goal[]
  retiringTimers?: string[]
  timersRetired?: true
}

async function pendingTasks(tx: Tx, kind: string) {
  const tasks = []
  let cursor: Cursor | undefined
  do {
    const page = await tx.scanTasks({ kind }, 128, cursor)
    tasks.push(...page.items.filter((item) => item.state.status !== 'terminal'))
    cursor = page.next
  } while (cursor)
  return tasks
}

async function pendingFires(tx: Tx, matches: (automation: Automation) => boolean) {
  return (await pendingTasks(tx, 'ultimate.automation-delivery')).flatMap((item) => {
    const input = item.input as { sub: Automation; kind: string }
    return input.kind === 'fired' && matches(input.sub)
      ? [{ task: item.id, timer: input.sub.id }]
      : []
  })
}

export async function retireReminders(host: ExtensionHost, goals: ConversationDocToken<GoalState>) {
  const harness = host.harness()
  const state = await harness.snapshot(goals, ROOT, context)
  if (state?.timersRetired || !state?.goals.some((goal) => !goal.workEvents)) return
  const oldSyncs = await harness.commit((tx) => pendingTasks(tx, 'goal.reminder'), context)
  for (const sync of oldSyncs) await harness.abortTask(sync.id, context)
  const legacy = (await harness.snapshot(goals, ROOT, context))!.goals.filter(
    (goal) => !goal.workEvents,
  )
  const matches = (item: Automation) =>
    legacy.some(
      (goal) =>
        item.id === goal.reminder ||
        (!goal.reminder &&
          item.key === `goal.reminder:${goal.id}` &&
          item.name === `Goal reminder · goal ${goal.id}`),
    )
  const automations = host.need(AutomationsApi)
  const list = (await host.invoke(
    'automations',
    'list',
    null,
    new AbortController().signal,
  )) as Automation[]
  const timers = await harness.commit(async (tx) => {
    const current = await tx.doc(goals, ROOT)
    if (current.timersRetired) return []
    const ids = new Set(current.retiringTimers)
    for (const goal of legacy) if (goal.reminder) ids.add(goal.reminder)
    for (const item of list) if (matches(item)) ids.add(item.id)
    for (const fire of await pendingFires(tx, matches)) ids.add(fire.timer)
    current.retiringTimers = [...ids]
    return [...ids]
  }, context)
  for (const item of list) if (timers.includes(item.id)) await automations.delete(item.id)
  const fires = await harness.commit(
    (tx) => pendingFires(tx, (item) => timers.includes(item.id)),
    context,
  )
  for (const fire of fires) await harness.abortTask(fire.task, context)
  await harness.commit(async (tx) => {
    const current = await tx.doc(goals, ROOT)
    const to = (await tx.doc(Standing, ROOT)).ultimate
    if (to !== undefined) {
      const inbox = await tx.doc(InboxDoc, to)
      inbox.items = inbox.items.filter((item) => {
        if (item.mode === 'write' || item.entry?.kind !== 'automations.fired') return true
        const data = item.entry.data as { id?: string } | undefined
        if (!data?.id || !timers.includes(data.id)) return true
        tx.settleSubmission(item.id, { status: 'unanswered', reason: 'goal-timer-retired' })
        return false
      })
    }
    current.timersRetired = true
    delete current.retiringTimers
  }, context)
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
