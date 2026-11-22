import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import { AgentDoc } from '@earendil-works/pi-durable'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { Branch } from '../../../lineage/api.ts'
import { Workspaces } from '../../../workspaces/workspaces.ts'
import { Result } from '../../refs.ts'
import type { ModeResult } from '../../refs.ts'
import { fauxServer, post, sourceCopy, temp, until } from '../../../../test/helpers.ts'

const runGit = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

test('one result for each automatic checkpoint on the exact candidate; repeat starts make no advisory requests', async () => {
  const home = await temp('coordinator-modes')
  const ultimateRoot = await sourceCopy(home)
  const projectRoot = join(home, 'project')
  const checkout = join(home, 'checkout')
  const config = join(home, '.ultimate')
  const faux = fauxProvider({
    provider: 'modes-fixture',
    api: 'openai-codex-responses',
    models: [{ id: 'sol' }, { id: 'astra', reasoning: true }],
  })
  await mkdir(config, { recursive: true })
  await writeFile(
    join(config, 'settings.json'),
    JSON.stringify({
      summaryModel: 'modes-fixture/disabled',
      modelFamilies: { families: { review: { model: 'modes-fixture/astra', thinking: 'low' } } },
    }),
  )
  await mkdir(projectRoot)
  runGit(projectRoot, 'init', '-b', 'main')
  runGit(
    projectRoot,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'Base',
  )
  const base = runGit(projectRoot, 'rev-parse', 'HEAD')
  runGit(projectRoot, 'worktree', 'add', '-b', 'fixture', checkout)
  await writeFile(join(checkout, 'candidate.txt'), 'candidate-evidence\n')
  runGit(checkout, 'add', 'candidate.txt')
  runGit(
    checkout,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'Candidate',
  )
  const sha = runGit(checkout, 'rev-parse', 'HEAD')
  const open = () => fauxServer({ ultimateRoot, projectRoot, home, userHome: home, faux })
  let server = await open()
  try {
    const newCoordinator = () =>
      server.harness.commit(async (tx) => {
        const { id: coordinator } = await tx.createConversation({
          ownership: { kind: 'ownerless' },
        })
        ;(await tx.doc(AgentDoc, coordinator)).model = { provider: 'modes-fixture', modelId: 'sol' }
        const entry = await tx.appendEntry(coordinator, {
          kind: 'fixture.private',
          model: [{ role: 'user', content: 'inherited-history-sentinel', timestamp: 0 }],
        })
        ;(await tx.doc(Branch, coordinator)).branch = {
          from: coordinator,
          at: entry.id,
          intent: 'Change a text fixture',
        }
        ;(await tx.doc(Workspaces, 1 as typeof coordinator)).items[coordinator] = {
          path: checkout,
          source: projectRoot,
          branch: 'fixture',
          base,
          target: 'main',
          state: 'ready',
        }
        return coordinator
      }, ctx)
    const id = await newCoordinator()
    const ask = (mode: 'plan' | 'review') =>
      fauxAssistantMessage(
        fauxToolCall('advisory_checkpoint', {
          mode,
          ...(mode === 'review' ? { revision: sha } : {}),
        }),
        { stopReason: 'toolUse' },
      )
    const encountered: {
      mode: string
      model: string
      effort?: string
      tools: number
      messages: number
      text: string
    }[] = []
    const advisory = (mode: 'plan' | 'review') =>
      ((request, options, _state, model) => {
        encountered.push({
          mode,
          model: model.id,
          effort: options?.reasoning,
          tools: 'tools' in request && Array.isArray(request.tools) ? request.tools.length : 0,
          messages: request.messages.filter((message) => message.role !== 'system').length,
          text: JSON.stringify(request.messages),
        })
        return fauxAssistantMessage(`${mode} answer`)
      }) satisfies Parameters<typeof faux.setResponses>[0][number]
    faux.setResponses([
      ask('plan'),
      advisory('plan'),
      ask('review'),
      advisory('review'),
      fauxAssistantMessage('Finished'),
    ])
    const conversation = (await server.harness.conversation(id, ctx))!
    const submission = await conversation.submit(
      { type: 'input', content: 'Make and review the substantive fixture change' },
      ctx,
    )
    const entries = (coordinator = id) =>
      server.harness.commit(
        async (tx) =>
          (await tx.scanEntries({ conversationId: coordinator }, 40)).items.filter(
            (entry) => entry.kind === Result.kind,
          ),
        ctx,
      )
    try {
      await until(async () => (await entries()).length === 2, 5000)
    } catch (error) {
      const checkpointRows = await server.harness.commit(
        async (tx) =>
          (await tx.scanEntries({ conversationId: id }, 40)).items
            .filter((entry) => entry.kind === Result.kind || entry.kind === 'pi.tool-result')
            .map((entry) => ({ kind: entry.kind, text: entry.model?.[0]?.content })),
        ctx,
      )
      throw new Error(
        `Checkpoint calls: ${faux.state.callCount}, initial: ${JSON.stringify(await submission.status(ctx))}, results: ${JSON.stringify(checkpointRows)}`,
        { cause: error },
      )
    }
    await conversation.waitForIdle(ctx)
    expect((await entries()).map((entry) => entry.data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'plan', status: 'ready', text: 'plan answer' }),
        expect.objectContaining({
          mode: 'review',
          status: 'ready',
          text: 'review answer',
          revision: sha,
        }),
      ]),
    )
    expect(encountered.map(({ text: _text, ...meta }) => meta)).toEqual(
      ['plan', 'review'].map((mode) => ({
        mode,
        model: 'astra',
        effort: 'low',
        tools: 0,
        messages: 1,
      })),
    )
    for (const call of encountered) expect(call.text).not.toContain('inherited-history-sentinel')
    expect(encountered[1].text).toContain('candidate-evidence')
    const calls = faux.state.callCount
    for (const mode of ['plan', 'review']) {
      const repeated = await post(server, '/api/extensions/coordinator-modes/actions/run', {
        args: { mode },
        conversationId: id,
      })
      expect(repeated).toEqual({ status: 200, data: { result: { started: false } } })
    }
    expect(faux.state.callCount).toBe(calls)
    expect((await entries()).length).toBe(2)

    const set = (mode: 'plan' | 'review', enabled: boolean) =>
      post(server, '/api/extensions/coordinator-modes/actions/setAutomatic', {
        args: { mode, enabled },
      })
    for (const [plan, review] of [
      [true, false],
      [false, true],
      [false, false],
    ]) {
      expect((await set('plan', plan)).status).toBe(200)
      expect((await set('review', review)).status).toBe(200)
      const next = await newCoordinator()
      faux.setResponses([
        ask('plan'),
        ...(plan ? [advisory('plan')] : []),
        ask('review'),
        ...(review ? [advisory('review')] : []),
        fauxAssistantMessage('Finished'),
      ])
      const actor = (await server.harness.conversation(next, ctx))!
      const prior = faux.state.callCount
      const input = await actor.submit({ type: 'input', content: 'Exercise switches' }, ctx)
      await input.wait(ctx)
      if (plan || review) await until(async () => (await entries(next)).length === 1)
      await actor.waitForIdle(ctx)
      expect(
        (await entries(next)).map((entry) => {
          const { mode, status } = entry.data as ModeResult
          return [mode, status]
        }),
      ).toEqual(plan ? [['plan', 'ready']] : review ? [['review', 'ready']] : [])
      expect(faux.state.callCount - prior).toBe(plan || review ? 4 : 3)
    }
    const restored = await newCoordinator()
    const manual = () =>
      post(server, '/api/extensions/coordinator-modes/actions/run', {
        args: { mode: 'review' },
        conversationId: restored,
      })
    server.harness.hold()
    const before = faux.state.callCount
    expect(await manual()).toEqual({ status: 200, data: { result: { started: true } } })
    expect(faux.state.callCount).toBe(before)
    await server.close()
    faux.setResponses([
      () => {
        runGit(
          checkout,
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          'commit',
          '--allow-empty',
          '-m',
          'Advance during review',
        )
        return fauxAssistantMessage('Stale answer withheld')
      },
      fauxAssistantMessage('Noted the stale candidate'),
    ])
    server = await open()
    await until(async () => (await entries(restored)).length === 1)
    const resumed = (await server.harness.conversation(restored, ctx))!
    await resumed.waitForIdle(ctx)
    expect((await entries(restored)).map((entry) => entry.data)).toEqual([
      expect.objectContaining({ mode: 'review', status: 'stale', revision: sha }),
    ])
    expect((await entries(restored))[0].model?.[0].content).not.toContain('Stale answer withheld')
    expect(faux.state.callCount - before).toBe(2)
    const keyed = await server.harness.commit(
      (tx) => tx.submissionByRequest(restored, `coordinator-modes:review:${sha}`),
      ctx,
    )
    expect(keyed).toMatchObject({ conversationId: restored, type: 'input', status: 'done' })
  } finally {
    await server.close()
    await rm(home, { recursive: true, force: true })
  }
})
