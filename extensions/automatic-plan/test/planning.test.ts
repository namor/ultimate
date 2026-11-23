import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import { AgentDoc, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { Branch } from '../../lineage/api.ts'
import { PlanCard, RevisionCard } from '../refs.ts'
import { Planning } from '../server.ts'
import { fauxServer, post, sourceCopy, temp, until } from '../../../test/helpers.ts'

test('plans on a sealed fork and sends only the explicit revision', async () => {
  const home = await temp('automatic-plan')
  const ultimateRoot = await sourceCopy(home)
  const projectRoot = join(home, 'project')
  await mkdir(join(projectRoot, '.ultimate'), { recursive: true })
  await writeFile(
    join(projectRoot, '.ultimate/settings.json'),
    JSON.stringify({
      modelFamilies: {
        families: { plan: { model: 'plan-fixture/astra', thinking: 'low' } },
        assign: { automaticPlan: 'plan' },
      },
    }),
  )
  await mkdir(join(home, '.ultimate'), { recursive: true })
  await writeFile(
    join(home, '.ultimate/settings.json'),
    JSON.stringify({ summaryModel: 'plan-fixture/disabled' }),
  )
  const faux = fauxProvider({
    api: 'openai-codex-responses',
    provider: 'plan-fixture',
    models: [{ id: 'sol' }, { id: 'astra', reasoning: true }],
  })
  const requests: { body: string; effort?: string }[] = []
  let reportedModel: string | undefined = 'astra'
  const route = (async (request, options, _state, model) => {
    faux.appendResponses([route])
    const body = JSON.stringify(request.messages)
    if (model.id === 'astra') {
      await options?.onProviderStreamEvent?.(
        { type: 'response.completed', response: { model: reportedModel } },
        model,
      )
      requests.push({ body, effort: options?.reasoning })
      return fauxAssistantMessage(
        body.includes('tighten the first check')
          ? 'Revised plan private-answer-sentinel'
          : 'First plan',
      )
    }
    if (body.includes('Advisory plan from the protected planning fork'))
      return fauxAssistantMessage('Continuing on Sol')
    return fauxAssistantMessage(fauxToolCall('automatic_plan', {}), { stopReason: 'toolUse' })
  }) satisfies Parameters<typeof faux.setResponses>[0][number]
  faux.setResponses([route])
  const open = () => fauxServer({ ultimateRoot, projectRoot, home, userHome: home, faux })
  let server = await open()
  try {
    const id = await server.harness.commit(async (tx) => {
      const { id: coordinator } = await tx.createConversation({ ownership: { kind: 'ownerless' } })
      ;(await tx.doc(AgentDoc, coordinator)).model = { provider: 'plan-fixture', modelId: 'sol' }
      const entry = await tx.appendEntry(coordinator, {
        kind: 'fixture.private',
        model: [{ role: 'user', content: 'private-context-sentinel', timestamp: 0 }],
      })
      ;(await tx.doc(Branch, coordinator)).branch = {
        from: ROOT_CONVERSATION_ID,
        at: entry.id,
        intent: 'protected branch intent',
      }
      return coordinator
    }, ctx)
    const conversation = (await server.harness.conversation(id, ctx))!
    const initial = await conversation.submit(
      {
        type: 'input',
        content:
          'Message from synthetic-coordinator\nEligible assignment: add a checklist\napplication-wrapper-sentinel',
        entry: {
          kind: 'board.message',
          data: { reply: true, text: 'Eligible assignment: add a checklist' },
        },
      },
      ctx,
    )
    await initial.wait(ctx)
    await conversation.waitForIdle(ctx)
    const entries = () =>
      server.harness.commit(
        async (tx) => (await tx.scanEntries({ conversationId: id }, 30)).items,
        ctx,
      )
    const first = (await entries()).find((row) => row.kind === PlanCard.kind)
    expect(first?.data).toMatchObject({ text: 'First plan' })
    const data = first?.data as { fork: typeof id }
    const fork = data.fork
    expect(await server.harness.commit((tx) => tx.conversation(fork), ctx)).toMatchObject({
      sealed: true,
      parent: { conversationId: id },
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].body).toContain('Eligible assignment')
    expect(requests[0].body).not.toContain('private-context-sentinel')
    expect(requests[0].body).not.toContain('application-wrapper-sentinel')
    expect(requests[0].effort).toBe('low')
    await server.close()
    server = await open()
    const thread = () => server.harness.snapshot(Planning, fork, ctx)
    expect(server.extensions.doc('automatic-plan.thread')).toBeUndefined()
    await expect(
      server.extensions.invoke(
        'automatic-plan',
        'readThread',
        { fork },
        new AbortController().signal,
        id,
        'agent',
      ),
    ).rejects.toThrow('user-only')
    for (const name of ['readThread', 'refine', 'sendRevision']) {
      await expect(
        server.extensions.invoke(
          'automatic-plan',
          name,
          { fork },
          new AbortController().signal,
          id,
          'ui',
          undefined,
          { source: 'agent' },
        ),
      ).rejects.toThrow('requires a person')
    }
    expect(await thread()).toMatchObject({
      coordinator: id,
      model: 'plan-fixture/astra',
      turns: [{ answer: 'First plan' }],
    })
    const action = (name: string, args: unknown) =>
      post(server, `/api/extensions/automatic-plan/actions/${name}`, { args })
    expect(
      (await action('refine', { fork, after: 1, text: 'tighten the first check' })).status,
    ).toBe(200)
    expect(
      (await action('refine', { fork, after: 1, text: 'tighten the first check' })).status,
    ).toBe(200)
    await until(
      async () => (await thread())?.turns[1]?.answer === 'Revised plan private-answer-sentinel',
    )
    const returnedThread = await action('readThread', { fork })
    expect(JSON.stringify(returnedThread.data)).toContain('private-answer-sentinel')
    const traceRows = server.extensions.trace.query({ limit: 400 })
    expect(traceRows.some((row) => row.name === 'conversations.askSummaryModel')).toBe(true)
    expect(traceRows.some((row) => row.name === 'conversations.accountResponse')).toBe(true)
    expect(JSON.stringify(traceRows)).not.toContain('private-answer-sentinel')
    expect(JSON.stringify(traceRows)).not.toContain('tighten the first check')
    expect((await entries()).some((row) => row.kind === RevisionCard.kind)).toBe(false)
    for (const _ of [1, 2])
      expect((await action('sendRevision', { fork, revision: 1 })).status).toBe(200)
    await until(async () => (await thread())?.sent === 1)
    expect((await entries()).filter((row) => row.kind === RevisionCard.kind)).toHaveLength(1)
    expect(requests).toHaveLength(2)
    for (const [reported, error] of [
      ['not-astra', 'different completion model'],
      [undefined, 'did not report the completion model'],
    ] as const) {
      reportedModel = reported
      const after = (await thread())!.turns.length
      expect(
        (await action('refine', { fork, after, text: 'do not release unverifiable text' })).status,
      ).toBe(200)
      await until(async () => !!(await thread())?.turns[after]?.error)
      expect((await thread())?.turns[after]).toMatchObject({
        error: expect.stringContaining(error),
      })
      expect((await thread())?.turns[after]?.answer).toBeUndefined()
    }
  } finally {
    await server.close()
  }
})
