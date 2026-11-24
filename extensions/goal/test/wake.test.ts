import { configure, InboxDoc, ROOT_CONVERSATION_ID as ROOT } from '@earendil-works/pi-durable'
import { fauxProvider, fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai/providers/faux'
import { expect, it } from 'vitest'
import { context, prepareHarness } from '../../../server/harness.ts'
import { EventFeed, eventLog } from '../../../server/events.ts'
import type { ExtensionHost } from '../../../server/extensions.ts'
import { temp, until, apis } from '../../../test/helpers.ts'
import { Concluded } from '../../conversations/api.ts'
import { SubmitAfter, submitAfter } from '../../conversations/submit.ts'
import { defineExtension } from '@earendil-works/pi-durable'
import { Messages, MessageSent } from '../../messages/api.ts'
import { Standing } from '../../subagents/api.ts'
import goalExtension, { act, actions } from '../server.ts'
import { eventFence } from '../wake.ts'

it('wakes an active goal once for related work and never replays paused, finished or unrelated events', async () => {
  const root = await temp('ultimate-goal-')
  const faux = fauxProvider()
  const answer = () => {
    faux.appendResponses([answer])
    return fauxAssistantMessage([fauxText('OK')])
  }
  faux.setResponses([answer])
  const prepared = await prepareHarness({ ultimateRoot: root, home: root, userHome: root, faux })
  let opened = await prepared.open()
  const { target, branch, other } = await opened.harness.commit(async (tx) => {
    const ownedBranch = (await tx.createConversation({ ownership: { kind: 'ownerless' } })).id
    const unrelated = (await tx.createConversation({ ownership: { kind: 'ownerless' } })).id
    const ultimate = (await tx.createConversation({ ownership: { kind: 'ownerless' } })).id
    await configure(tx, ultimate, {
      model: { provider: faux.getModel().provider, modelId: faux.getModel().id },
    })
    ;(await tx.doc(Standing, ROOT)).ultimate = ultimate
    return { branch: ownedBranch, other: unrelated, target: ultimate }
  }, context)
  const log = eventLog(
    () => opened.harness,
    (_call, run) => run(),
  )
  let reactor: ReturnType<typeof log.reactor>
  const host = {
    harness: () => opened.harness,
    onOpen: () => {},
    doc: () => EventFeed,
    react: ((name, tokens, handler, options) => {
      reactor = log.reactor(`goal/${name}`, tokens, handler, options)
    }) satisfies ExtensionHost['react'],
    ...apis(
      new Map<string, unknown>([
        [
          'messages',
          { starterIn: async (_tx: unknown, id: number) => (id === branch ? target : ROOT) },
        ],
        ['conversations', { concludedIn: async () => new Set([branch]), submitAfter }],
      ]),
    ),
  } as unknown as ExtensionHost
  prepared.registry.install(defineExtension({ name: 'conversations', tasks: [SubmitAfter] }))
  prepared.registry.install(goalExtension(host))
  const ready = async () => {
    await until(async () => (await log.eventLog.reactors()).some((r) => r.lag === 0 && !r.failure))
    await opened.harness.waitForIdle(context)
  }
  const wakeCount = () =>
    opened.harness.commit(
      async (tx) =>
        (await tx.scanEntries({ conversationId: target }, 200)).items.filter(
          (e) => e.kind === 'goal.wake',
        ).length,
      context,
    )
  const ask = (from = branch) =>
    opened.harness.commit(async (tx) => {
      const board = await tx.doc(Messages, ROOT)
      const message = board.next++
      board.messages.push({
        id: message,
        from,
        to: 'user',
        reply: true,
        state: 'delivered',
        text: 'Which account?',
        at: 0,
      })
      await log.emit(tx, MessageSent, { message, from, to: 'user', reply: true, steer: false })
    }, context)
  try {
    await reactor!.start()
    await ask(other)
    await ready()
    await reactor!.stop()
    await ask()
    await expect(
      actions.start({ text: 'Ship the sidebar', proposal: 'call-1' }, { host } as never),
    ).resolves.toMatchObject({ proposal: 'call-1', workEvents: true })
    await reactor!.start()
    await ask(other)
    await opened.harness.commit(
      (tx) =>
        log.emit(tx, Concluded, {
          conversations: [branch],
          newlyConcluded: [branch],
          by: 'landing',
        }),
      context,
    )
    await ready()
    expect(await wakeCount()).toBe(0)

    await ask()
    await ready()
    expect(await wakeCount()).toBe(1)

    await reactor!.stop()
    await opened.close()
    opened = await prepared.open()
    await reactor!.start()
    await ready()
    expect(await wakeCount()).toBe(1)

    await opened.harness.commit(
      (tx) => act(tx, target, { action: 'pause', reason: 'Account choice' }, 1),
      context,
    )
    await ask()
    await ready()
    expect(await wakeCount()).toBe(1)
    // An event committed while paused must stay ineligible even if the reactor sees it after resume.
    await reactor!.stop()
    await ask()
    await opened.harness.commit(
      async (tx) => act(tx, target, { action: 'resume' }, 2, await eventFence(host, tx)),
      context,
    )
    await reactor!.start()
    await ready()
    expect(await wakeCount()).toBe(1)

    await opened.harness.commit(
      (tx) =>
        log.emit(tx, Concluded, {
          conversations: [branch],
          newlyConcluded: [branch],
          by: 'user',
        }),
      context,
    )
    await ready()
    expect(await wakeCount()).toBe(2)

    const hold = Promise.withResolvers<ReturnType<typeof answer>>()
    const busy = Promise.withResolvers<void>()
    faux.setResponses([
      () => {
        busy.resolve()
        return hold.promise
      },
      answer,
    ])
    const ultimate = (await opened.harness.conversation(target, context))!
    const run = await ultimate.submit({ type: 'input', content: 'Keep working' }, context)
    try {
      await busy.promise
      await ask()
      const queued = async () => (await opened.harness.snapshot(InboxDoc, target, context))?.items
      await until(async () => !!(await queued())?.some((item) => item.entry?.kind === 'goal.wake'))
      await ultimate.submit({ type: 'input', content: 'Keep this', whenBusy: 'followUp' }, context)
      await opened.harness.commit(
        (tx) => act(tx, target, { action: 'pause', reason: 'Account choice' }, 3),
        context,
      )
      expect(await queued()).toMatchObject([{ content: 'Keep this' }])
    } finally {
      hold.resolve(fauxAssistantMessage([fauxText('OK')]))
    }
    await run.wait(context)
    await ready()
    expect(await wakeCount()).toBe(2)
    await actions.end(null, { host } as never)
    await ask()
    await ready()
    expect(await wakeCount()).toBe(2)
    expect((await opened.harness.snapshot(InboxDoc, target, context))?.items).toHaveLength(0)
  } finally {
    await reactor!.stop()
    await opened.close()
  }
})
