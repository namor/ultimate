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
    options: { data?: JsonValue; typed?: boolean | 'message' | 'voice' } = {},
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
          kind: options.typed === true ? 'prompt' : 'answer',
          ...(options.typed === true
            ? { entry: placed.id }
            : { message: (options.data as { id: number }).id }),
          length: 8,
          // A voice-forwarded answer has no browser behind it; the composer and answer card always do.
          ...(options.typed === 'voice' ? {} : { device: 'desktop/chrome' }),
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
  return { opened, host, ultimate, branch, earlier, entry, queued, call }
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
    // An answer the voice model forwarded on the user's behalf: an event, but no device.
    const voiced = await f.entry(f.ultimate, 'board.message', {
      data: { id: 11, from: 'user' },
      typed: 'voice',
    })
    await expect(f.call({ conversationId: f.ultimate }, { instruction: voiced })).rejects.toThrow(
      'not one written in their name',
    )
    expect((await f.queued()).mergeApproved).toBeUndefined()
  })

  it('refuses an instruction judged before a reassessment moved the submission point', async () => {
    const f = await fixture()
    const instruction = await f.entry(f.ultimate, 'pi.user', { typed: true })
    // The reassessment lands between the approver's snapshot and its commit.
    const commit = f.opened.harness.commit.bind(f.opened.harness)
    let moved = false
    f.opened.harness.commit = async (update: unknown, ctx: unknown) => {
      if (!moved) {
        moved = true
        await commit(async (tx) => {
          const queued = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue[0]
          queued.at = (await tx.appendEntry(f.branch, { kind: 'test.resubmit' })).id
        }, context)
      }
      return commit(update as never, ctx as never)
    }
    await expect(f.call({ conversationId: f.ultimate }, { instruction })).rejects.toThrow(
      'reassessed',
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
    // Once the other delivery merged, its record (with the instruction) lives in the results.
    await f.opened.harness.commit(async (tx) => {
      const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
      const other = index.queue.find((item) => item.id === 'other')!
      index.queue = index.queue.filter((item) => item !== other)
      index.results.other = {
        outcome: 'landed',
        delivery: other.delivery,
        at: other.at,
        divergence: other.divergence,
        target: other.target,
        tip: other.tip,
        lander: 1,
        steps: [],
        conversationId: other.conversationId,
      }
    }, context)
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

  describe('standing approval', () => {
    /** The user's typed grant, then a submission after it awaiting merge. */
    const granted = async (hours?: number) => {
      const f = await fixture()
      const instruction = await f.entry(f.ultimate, 'pi.user', { typed: true })
      await actions.standing({ instruction, ...(hours ? { hours } : {}) }, {
        host: f.host,
        conversationId: f.ultimate,
        signal: new AbortController().signal,
      } as unknown as ActionContext)
      return { ...f, instruction }
    }
    const approve = (f: Awaited<ReturnType<typeof granted>>, args = {}) =>
      f.call({ conversationId: f.ultimate }, { standing: true, reason: 'verified', ...args })
    const set = (f: { opened: OpenHost }, change: (delivery: Delivery) => void) =>
      f.opened.harness.commit(async (tx) => {
        change((await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue[0].delivery!)
      }, context)

    it('lets @ultimate approve verified, reviewed, CI-green work and records the grant and reason', async () => {
      const f = await granted()
      await approve(f)
      const delivery = await f.queued()
      expect(delivery.mergeApproved).toBe(true)
      expect(delivery.approvals).toEqual([
        {
          action: 'merge',
          at: expect.any(Number),
          by: 'ultimate',
          conversation: f.ultimate,
          standing: f.instruction,
          reason: 'verified',
        },
      ])
    })

    it('refuses without verification on this runtime, review, green CI or a settled write', async () => {
      const f = await granted()
      await set(f, (d) => void (d.runtime = 'other'))
      await expect(approve(f)).rejects.toThrow('another runtime')
      await set(f, (d) => {
        d.runtime = deliveryRuntime()
        d.stage = 'review'
      })
      await expect(approve(f)).rejects.toThrow('No independent review')
      // CI not yet green: the lander keeps the delivery in `ci` until the exact head's required checks pass.
      await set(f, (d) => void (d.stage = 'ci'))
      await expect(approve(f)).rejects.toThrow('GitHub checks have not passed')
      await set(f, (d) => {
        d.stage = 'merge'
        d.mergeIntent = true
      })
      await expect(approve(f)).rejects.toThrow('uncertain write')
      await expect(approve(f, { action: 'stop' })).rejects.toThrow('publish and merge only')
      expect((await f.queued()).approvals).toBeUndefined()
    })

    it('refuses on a changed candidate or tree', async () => {
      const f = await granted()
      await expect(approve(f, { tree: 'd'.repeat(40) })).rejects.toThrow('candidate changed')
      await expect(approve(f, { candidate: 'd'.repeat(40) })).rejects.toThrow('candidate changed')
      expect((await f.queued()).mergeApproved).toBeUndefined()
    })

    it('refuses once revoked by the user, or expired, and needs new words to renew', async () => {
      const f = await granted()
      await actions.standing({ revoke: true }, {
        host: f.host,
        device: { device: 'desktop/chrome' },
        signal: new AbortController().signal,
      } as ActionContext)
      await expect(approve(f)).rejects.toThrow('No standing approval')
      const renew = (instruction: number) =>
        actions.standing({ instruction }, {
          host: f.host,
          conversationId: f.ultimate,
          signal: new AbortController().signal,
        } as unknown as ActionContext)
      await expect(renew(f.instruction)).rejects.toThrow('newer instruction')
      await renew(await f.entry(f.ultimate, 'pi.user', { typed: true }))
      await f.opened.harness.commit(async (tx) => {
        ;(await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).standing!.until = Date.now() - 1
      }, context)
      await expect(approve(f)).rejects.toThrow('expired')
      expect((await f.queued()).mergeApproved).toBeUndefined()
    })

    it('defaults to 24 hours and is granted only by @ultimate on typed words', async () => {
      const f = await granted()
      const grant = (await f.opened.harness.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))!
        .standing!
      expect(grant.until - grant.at).toBe(24 * 3600_000)
      const ctx = (extra: object) =>
        ({ host: f.host, signal: new AbortController().signal, ...extra }) as ActionContext
      const typed = await f.entry(f.ultimate, 'pi.user', { typed: true })
      await expect(
        actions.standing({ instruction: typed }, ctx({ conversationId: f.branch })),
      ).rejects.toThrow('Only the user or @ultimate')
      const placed = await f.entry(f.ultimate, 'pi.user')
      await expect(
        actions.standing({ instruction: placed }, ctx({ conversationId: f.ultimate })),
      ).rejects.toThrow('not one written in their name')
    })

    it('grants only on the latest typed words, never reused or older ones', async () => {
      const f = await fixture()
      const grant = (instruction: number) =>
        actions.standing({ instruction }, {
          host: f.host,
          conversationId: f.ultimate,
          signal: new AbortController().signal,
        } as unknown as ActionContext)
      const older = await f.entry(f.ultimate, 'pi.user', { typed: true })
      const used = await f.entry(f.ultimate, 'pi.user', { typed: true })
      await f.call({ conversationId: f.ultimate }, { instruction: used })
      await expect(grant(older)).rejects.toThrow("the user's latest input")
      await expect(grant(used)).rejects.toThrow('already decided a delivery')
    })

    it('revoking withdraws a standing approval no write has used', async () => {
      const f = await granted()
      await approve(f)
      expect((await f.queued()).mergeApproved).toBe(true)
      await actions.standing({ revoke: true }, {
        host: f.host,
        conversationId: f.ultimate,
        signal: new AbortController().signal,
      } as unknown as ActionContext)
      const delivery = await f.queued()
      expect(delivery.mergeApproved).toBeUndefined()
      // The audit record stays.
      expect(delivery.approvals?.[0]).toMatchObject({ standing: f.instruction })
    })

    it('refuses a non-root caller and an open hands-off goal', async () => {
      const f = await granted()
      await expect(
        f.call({ conversationId: f.branch }, { standing: true, reason: 'verified' }),
      ).rejects.toThrow('Only the user or @ultimate')
      await f.opened.harness.commit(async (tx) => {
        ;(await tx.doc(Goals, ROOT_CONVERSATION_ID)).goals.push({
          id: 1,
          text: 'ship it',
          startedAt: Date.now(),
          criteria: [],
          decisions: [],
        })
      }, context)
      await expect(approve(f)).rejects.toThrow('hands-off goal')
      expect((await f.queued()).approvals).toBeUndefined()
    })
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
