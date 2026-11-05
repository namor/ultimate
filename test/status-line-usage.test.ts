import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { createModels } from '@earendil-works/pi-ai/models'
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux'
import {
  configure,
  createRegistry,
  defineExtension,
  defineTask,
  Harness,
  MemoryStorage,
  UsageDoc,
} from '@earendil-works/pi-durable'
import type { ConversationId } from '@earendil-works/pi-durable'
import { expect, it } from 'vitest'
import { subtreeUsage } from '../extensions/status-line/usage.ts'
import { actions } from '../extensions/status-line/server.ts'
import { Metadata } from '../server/metadata.ts'

const anchor = defineTask<null, { phase: 'done' }, null>({
  name: 'usage.fixture',
  version: 1,
  initial: () => ({ phase: 'done' }),
  phases: {
    done: (_task, runtime, caller) =>
      runtime.commit(
        () => ({ status: 'terminal', outcome: { status: 'completed', result: null } }),
        caller,
      ),
  },
  abort: (_task, runtime, caller) =>
    runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), caller),
})

it('counts each owned conversation once across nested tasks, fork history and resumed work, preserving unknown evidence', async () => {
  const models = createModels()
  const faux = fauxProvider()
  let output = 10
  const usage = (count: number) => ({
    input: count * 2,
    output: count,
    cacheRead: count * 3,
    cacheWrite: count * 4,
    totalTokens: count * 10,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: count / 100 },
  })
  models.setProvider({
    ...faux.provider,
    streamSimple(model) {
      const stream = createAssistantMessageEventStream()
      const answer = {
        ...fauxAssistantMessage('Done'),
        provider: model.provider,
        model: model.id,
        api: model.api,
        usage: usage(output),
      }
      queueMicrotask(() => {
        stream.push({ type: 'done', reason: 'stop', message: answer })
        stream.end(answer)
      })
      return stream
    },
  })
  const registry = createRegistry()
  registry.install(defineExtension({ name: 'usage-fixture', tasks: [anchor] }))
  const storage = new MemoryStorage()
  storage.close = async () => {}
  let harness = await Harness.open(storage, { models, registry }, context)
  const host = { harness: () => harness, metadata: Metadata }
  const agent = { model: { provider: 'faux', modelId: 'faux-1' } }
  const root = await harness.root(context, { agent })
  const actionContext = { host, conversationId: root.id }
  const answer = async (id: ConversationId, count: number) => {
    output = count
    const conversation = (await harness.conversation(id, context))!
    expect(
      (
        await (
          await conversation.submit({ type: 'input', content: 'Continue' }, context)
        ).wait(context)
      ).status,
    ).toBe('done')
  }
  try {
    await answer(root.id, 10)
    const ids = await harness.commit(async (tx) => {
      const at = (await tx.latestEntryId(root.id))!
      const task = await tx.createTask(anchor, null, {
        ownership: { kind: 'conversation' },
        conversationId: root.id,
        background: true,
      })
      const intermediate = await tx.createTask(anchor, null, {
        ownership: { kind: 'task', taskId: task },
      })
      const child = await tx.forkConversation(root.id, at, {
        ownership: { kind: 'task', taskId: intermediate },
      })
      const nestedTask = await tx.createTask(anchor, null, {
        ownership: { kind: 'conversation' },
        conversationId: child.id,
        background: true,
      })
      const nested = await tx.createConversation({
        ownership: { kind: 'task', taskId: nestedTask },
      })
      await configure(tx, nested.id, agent)
      const sibling = await tx.forkConversation(root.id, at, { ownership: { kind: 'ownerless' } })
      Object.assign(await tx.doc(Metadata, child.id), {
        label: 'worker',
        title: 'Implement the task',
      })
      const own = await tx.doc(UsageDoc, root.id)
      own.models['faux/summary'] = { ...usage(2), reasoning: 0, cacheWrite1h: 0 }
      own.tools.probe = usage(5)
      return { child: child.id, nested: nested.id, sibling: sibling.id, task }
    }, context)
    await answer(ids.child, 20)
    await answer(ids.nested, 30)
    await answer(ids.sibling, 1000)
    const before = await subtreeUsage(host, root.id)
    expect(before.conversations.map((row) => row.id)).toEqual([root.id, ids.child, ids.nested])
    expect(before.totals).toMatchObject({
      input: 134,
      output: 67,
      cacheRead: 201,
      cacheWrite: 268,
      reasoning: null,
      cacheWrite1h: null,
    })
    expect(before.totals.cost).toBeCloseTo(0.67)
    expect(before.models['faux/faux-1'].output).toBe(60)
    expect(before.models['faux/summary'].output).toBe(2)
    expect(before.models['faux/summary'].reasoning).toBe(0)
    expect(before.models['faux/summary'].cacheWrite1h).toBe(0)
    expect(before.tools.probe.output).toBe(5)
    expect(before.conversations[1]).toMatchObject({ label: 'worker', totals: { output: 20 } })
    expect((await subtreeUsage(host, ids.child)).totals.output).toBe(50)
    expect((await subtreeUsage(host, ids.sibling)).totals.output).toBe(1000)

    await harness.close(context)
    harness = await Harness.open(storage, { models, registry }, context)
    harness.resume()
    await answer(root.id, 40)
    expect((await actions.usage(null, actionContext)).totals.output).toBe(107)
    for (const id of [0, -1, 1.5, null, '1'])
      expect(() => actions.usage({ conversation: id }, actionContext)).toThrow(
        'positive conversation number',
      )
    expect((await subtreeUsage(host, root.id)).totals.output).toBe(107)

    const missing = await harness.commit(async (tx) => {
      const task = await tx.createTask(anchor, null, {
        ownership: { kind: 'conversation' },
        conversationId: ids.child,
        background: true,
      })
      return (await tx.createConversation({ ownership: { kind: 'task', taskId: task } })).id
    }, context)
    const partial = await subtreeUsage(host, root.id)
    expect(partial.conversations.find((row) => row.id === missing)?.totals.output).toBeNull()
    expect(partial.totals.output).toBeNull()
    expect(partial.models['faux/faux-1'].output).toBe(100)
    expect(await harness.snapshot(UsageDoc, missing, context)).toEqual({ models: {}, tools: {} })
    await harness.commit((tx) => tx.retireDoc(UsageDoc, missing), context)
    expect((await subtreeUsage(host, missing)).totals.output).toBeNull()
    expect(await harness.snapshot(UsageDoc, missing, context)).toBeUndefined()
    await expect(subtreeUsage(host, 999999 as ConversationId)).rejects.toThrow(
      'Unknown conversation',
    )
  } finally {
    await harness.close(context)
  }
})
