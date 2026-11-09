import type { JsonValue } from '@earendil-works/chord'
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux'
import { ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import type { ConversationId } from '@earendil-works/pi-durable'
import { afterEach, describe, expect, it } from 'vitest'
import { context, prepareHarness } from '../server/harness.ts'
import type { OpenHost } from '../server/harness.ts'
import type { ActionContext } from '../server/actions.ts'
import type { ExtensionHost } from '../server/extensions.ts'
import { Goals } from '../extensions/goal/server.ts'
import { Standing } from '../extensions/subagents/api.ts'
import { actions, userActions } from '../extensions/workspaces/server.ts'
import { deliveryRuntime } from '../extensions/workspaces/delivery.ts'
import type { Delivery } from '../extensions/workspaces/delivery.ts'
import { Workspaces } from '../extensions/workspaces/workspaces.ts'
import { UserInputEvent } from '../shared/events.ts'
import { eventHost, temp } from './helpers.ts'

const hosts: OpenHost[] = []
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close()
})

const candidate = 'a'.repeat(40)
const tree = 'c'.repeat(40)

/** A harness with @ultimate registered, a branch, and one submission awaiting its medium-risk merge approval. */
async function fixture() {
  const home = await temp('ultimate-delivery-approval-')
  const prepared = await prepareHarness({
    home,
    ultimateRoot: home,
    userHome: home,
    faux: fauxProvider(),
  })
  const opened = await prepared.open()
  hosts.push(opened)
  const resumed: string[] = []
  const events = eventHost(() => opened.harness, 'delivery-approval')
  const host = {
    ...prepared,
    harness: () => opened.harness,
    eventLog: events.eventLog,
    doc: (kind: string) =>
      kind === Standing.definition.kind
        ? Standing
        : kind === Goals.definition.kind
          ? Goals
          : undefined,
    resource: <T>(_key: string, create: () => T) => create(),
    want: () => undefined,
    need: () => new Proxy({}, { get: () => () => undefined }),
    notice: (message: string) => resumed.push(message),
  } as unknown as ExtensionHost
  const conversation = async () =>
    (await opened.harness.createConversation({ ownership: { kind: 'ownerless' } }, context)).id
  const ultimate = await conversation()
  const branch = await conversation()
  const submitter = await conversation()
  const delivery: Delivery = {
    settings: {
      repository: 'example/my-app',
      remote: 'origin',
      base: 'main',
      checks: ['verify'],
      requiredChecks: ['verify'],
    },
    risk: 'medium',
    review: 'fixture',
    baseline: 'b'.repeat(40),
    candidate,
    tree,
    branch: 'ultimate-delivery/test',
    checkedAt: Date.now(),
    runtime: deliveryRuntime(),
    stage: 'merge',
    pr: 3,
  }
  // A user input in @ultimate's conversation before the submission, then the submission's `at` entry.
  const earlier = await opened.harness.commit(async (tx) => {
    ;(await tx.doc(Standing, ROOT_CONVERSATION_ID)).ultimate = ultimate
    return (
      await tx.appendEntry(ultimate, {
        kind: 'pi.user',
        model: [{ role: 'user', content: 'ship everything', timestamp: Date.now() }],
      })
    ).id
  }, context)
  await opened.harness.commit(async (tx) => {
    const at = (await tx.appendEntry(submitter, { kind: 'test.submit' })).id
    const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
    index.queue.push({
      id: 'submission',
      conversationId: submitter,
      source: '/fixture',
      target: 'main',
      tip: candidate,
      at,
      divergence: 'None',
      state: 'waiting',
      steps: [],
      delivery,
    })
  }, context)
  /** An entry in a conversation; `typed` also emits the `user.input` event the composer or answer card would. */
  const entry = (
    conversationId: ConversationId,
    kind: string,
    options: { data?: JsonValue; typed?: boolean | 'message' } = {},
  ) =>
    opened.harness.commit(async (tx) => {
      const placed = await tx.appendEntry(conversationId, {
        kind,
        ...(options.data !== undefined ? { data: options.data } : {}),
        model: [{ role: 'user', content: 'merge it', timestamp: Date.now() }],
      })
      if (options.typed)
        await events.emit(tx, UserInputEvent, {
          conversation: conversationId,
          kind: options.typed === 'message' ? 'answer' : 'prompt',
          ...(options.typed === 'message'
            ? { message: (options.data as { id: number }).id }
            : { entry: placed.id }),
          length: 8,
        })
      return placed.id
    }, context)
  const queued = async () =>
    (await opened.harness.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))!.queue.find(
      (item) => item.id === 'submission',
    )!.delivery!
  const call = (
    ctx: Partial<Pick<ActionContext, 'conversationId' | 'device'>>,
    args: Record<string, unknown> = {},
  ) =>
    actions.delivery({ id: 'submission', candidate, tree, action: 'merge', ...args }, {
      host,
      signal: new AbortController().signal,
      ...ctx,
    } as ActionContext)
  return { opened, ultimate, branch, earlier, entry, queued, call }
}

describe('delivery approval', () => {
  it('is no longer reserved for the browser', () => {
    expect(userActions).not.toContain('delivery')
  })

  it("lets @ultimate approve on the user's later instruction and records who approved", async () => {
    const f = await fixture()
    const instruction = await f.entry(f.ultimate, 'pi.user', { typed: true })
    await f.call({ conversationId: f.ultimate }, { instruction })
    const delivery = await f.queued()
    expect(delivery.mergeApproved).toBe(true)
    expect(delivery.approvals).toEqual([
      {
        action: 'merge',
        at: expect.any(Number),
        by: 'ultimate',
        conversation: f.ultimate,
        instruction,
      },
    ])
  })

  it("records the user's own click without an instruction", async () => {
    const f = await fixture()
    await f.call({ device: { device: 'desktop/chrome' } })
    const delivery = await f.queued()
    expect(delivery.mergeApproved).toBe(true)
    expect(delivery.approvals).toEqual([{ action: 'merge', at: expect.any(Number), by: 'user' }])
  })

  it("accepts the user's answer on its card as the instruction", async () => {
    const f = await fixture()
    const instruction = await f.entry(f.ultimate, 'board.message', {
      data: { id: 7, from: 'user' },
      typed: 'message',
    })
    await f.call({ conversationId: f.ultimate }, { instruction })
    expect((await f.queued()).approvals?.[0]).toMatchObject({ by: 'ultimate', instruction })
  })

  it('refuses every other conversation, even with a real instruction entry', async () => {
    const f = await fixture()
    const instruction = await f.entry(f.ultimate, 'pi.user', { typed: true })
    await expect(f.call({ conversationId: f.branch }, { instruction })).rejects.toThrow(
      'Only the user or @ultimate',
    )
    await expect(f.call({}, { instruction })).rejects.toThrow('Only the user or @ultimate')
    expect((await f.queued()).mergeApproved).toBeUndefined()
    expect((await f.queued()).approvals).toBeUndefined()
  })

  it('refuses an instruction that is missing, elsewhere, older than the submission, or never typed by the user', async () => {
    const f = await fixture()
    await expect(f.call({ conversationId: f.ultimate })).rejects.toThrow('Pass instruction')
    const elsewhere = await f.entry(f.branch, 'pi.user', { typed: true })
    await expect(
      f.call({ conversationId: f.ultimate }, { instruction: elsewhere }),
    ).rejects.toThrow('entry of your conversation')
    await expect(
      f.call({ conversationId: f.ultimate }, { instruction: f.earlier }),
    ).rejects.toThrow('newer than this submission')
    // A `pi.user` input the server placed (a watchdog retry, an update card) and a "from user" answer @ultimate settled
    // in the user's name both lack the user's own `user.input` event.
    const placed = await f.entry(f.ultimate, 'pi.user')
    await expect(f.call({ conversationId: f.ultimate }, { instruction: placed })).rejects.toThrow(
      'not one written in their name',
    )
    const settled = await f.entry(f.ultimate, 'board.message', { data: { id: 9, from: 'user' } })
    await expect(f.call({ conversationId: f.ultimate }, { instruction: settled })).rejects.toThrow(
      'not one written in their name',
    )
    expect((await f.queued()).mergeApproved).toBeUndefined()
  })

  it('lets one instruction decide only one delivery', async () => {
    const f = await fixture()
    const instruction = await f.entry(f.ultimate, 'pi.user', { typed: true })
    await f.opened.harness.commit(async (tx) => {
      const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
      index.queue.push({
        ...index.queue[0],
        id: 'other',
        delivery: { ...index.queue[0].delivery! },
      })
    }, context)
    await f.call({ conversationId: f.ultimate }, { instruction, id: 'other' })
    await expect(f.call({ conversationId: f.ultimate }, { instruction })).rejects.toThrow(
      'already decided another delivery',
    )
    expect((await f.queued()).mergeApproved).toBeUndefined()
  })

  it('refuses @ultimate while a hands-off goal is open', async () => {
    const f = await fixture()
    await f.opened.harness.commit(async (tx) => {
      ;(await tx.doc(Goals, ROOT_CONVERSATION_ID)).goals.push({
        id: 1,
        text: 'ship it',
        startedAt: Date.now(),
        criteria: [],
        decisions: [],
      })
    }, context)
    const instruction = await f.entry(f.ultimate, 'pi.user', { typed: true })
    await expect(f.call({ conversationId: f.ultimate }, { instruction })).rejects.toThrow(
      'hands-off goal',
    )
  })

  it('still binds every caller to the exact candidate', async () => {
    const f = await fixture()
    const instruction = await f.entry(f.ultimate, 'pi.user', { typed: true })
    await expect(
      f.call({ conversationId: f.ultimate }, { instruction, candidate: 'd'.repeat(40) }),
    ).rejects.toThrow('candidate changed')
    await expect(
      f.call({ device: { device: 'desktop/chrome' } }, { tree: 'd'.repeat(40) }),
    ).rejects.toThrow('candidate changed')
    expect((await f.queued()).approvals).toBeUndefined()
  })
})
