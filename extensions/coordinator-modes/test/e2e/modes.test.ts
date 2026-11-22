import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import { AgentDoc, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import type { ConversationId } from '@earendil-works/pi-durable'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { Branch } from '../../../lineage/api.ts'
import { Messages } from '../../../messages/api.ts'
import { Workspaces } from '../../../workspaces/workspaces.ts'
import { Result } from '../../refs.ts'
import { Runs } from '../../server.ts'
import type { ModeResult } from '../../refs.ts'
import { fauxServer, held, post, sourceCopy, temp, until } from '../../../../test/helpers.ts'

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
  await writeFile(
    join(projectRoot, 'removed.txt'),
    'deleted-private-sentinel\n' + 'x'.repeat(1024 * 1024) + '\n',
  )
  runGit(projectRoot, 'add', 'removed.txt')
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
  runGit(checkout, 'rm', 'removed.txt')
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
          intent: 'private-branch-intent-sentinel',
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
    for (const call of encountered)
      expect(call.text).not.toContain('private-branch-intent-sentinel')
    expect(encountered[1].text).not.toContain('candidate-evidence')
    expect(encountered[1].text).not.toContain('deleted-private-sentinel')
    expect(encountered[1].text).not.toContain('removed.txt')
    expect(encountered[1].text).toContain('2 files changed')
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

    expect((await set('plan', true)).status).toBe(200)
    const standing = await post(server, '/api/extensions/subagents/actions/standing', {
      args: { name: 'ultimate' },
    })
    expect(standing.status).toBe(200)
    const starter = standing.data.result as ConversationId
    const requests = async () =>
      (await server.harness.snapshot(Messages, ROOT_CONVERSATION_ID, ctx))!
    const gate = Promise.withResolvers<void>()
    let waiting = false
    const prompt = 'Prove the real branch request is preserved'
    const done = 'Completed the real branch request after receiving Plan.'
    const route = ((request, _options, _state, model) => {
      faux.appendResponses([route])
      const last = request.messages.at(-1)
      const body = JSON.stringify(last?.content)
      if (model.id === 'astra') {
        waiting = true
        return gate.promise.then(() => fauxAssistantMessage('Advisory Plan'))
      }
      if (last?.role === 'user' && body.includes('start-fixture-branch'))
        return fauxAssistantMessage(fauxToolCall('branch', { prompt, isolated: false }), {
          stopReason: 'toolUse',
        })
      if (last?.role === 'user' && body.includes(prompt)) return ask('plan')
      if (last?.role === 'toolResult' && last.toolName === 'advisory_checkpoint')
        return fauxAssistantMessage(done)
      return fauxAssistantMessage('Noted')
    }) satisfies Parameters<typeof faux.setResponses>[0][number]
    faux.setResponses([route])
    await (await server.harness.conversation(starter, ctx))!.submit(
      { type: 'input', content: 'start-fixture-branch' },
      ctx,
    )
    try {
      await until(() => waiting, 8000)
      const request = (await requests()).messages.find(
        (msg) => msg.text === prompt && msg.from === starter,
      )!
      expect(request.reply).toBe(true)
      expect((await requests()).messages.filter((msg) => msg.re === request.id)).toEqual([])
      gate.resolve()
      await until(async () => (await requests()).messages.some((msg) => msg.re === request.id))
      expect((await requests()).messages.filter((msg) => msg.re === request.id)).toEqual([
        expect.objectContaining({ text: done, to: starter }),
      ])
    } finally {
      gate.resolve()
    }

    const rejected = await newCoordinator()
    const requestMode = (mode: 'plan' | 'review', coordinator: ConversationId) =>
      post(server, '/api/extensions/coordinator-modes/actions/run', {
        args: { mode },
        conversationId: coordinator,
      })
    runGit(checkout, 'config', 'status.showUntrackedFiles', 'no')
    await writeFile(join(checkout, 'not-committed.txt'), 'unsaved')
    expect((await requestMode('review', rejected)).data).toMatchObject({
      error: expect.stringContaining('clean worktree'),
    })
    await rm(join(checkout, 'not-committed.txt'))
    await mkdir(join(projectRoot, '.ultimate'), { recursive: true })
    await writeFile(join(projectRoot, '.ultimate/settings.json'), '{')
    expect((await requestMode('plan', rejected)).status).toBe(500)
    await rm(join(projectRoot, '.ultimate/settings.json'))

    let providerReceived = false
    faux.setResponses([
      (request, options, state, model) => {
        providerReceived = true
        return held(request, options, state, model)
      },
    ])
    expect((await requestMode('plan', rejected)).status).toBe(200)
    await until(() => providerReceived)
    await server.close()
    const reopenedModels: string[] = []
    const afterRestart = ((_request, _options, _state, model) => {
      reopenedModels.push(model.id)
      faux.appendResponses([afterRestart])
      return fauxAssistantMessage('Noted interruption')
    }) satisfies Parameters<typeof faux.setResponses>[0][number]
    faux.setResponses([afterRestart])
    server = await open()
    await until(async () => (await entries(rejected)).length === 1)
    await (await server.harness.conversation(rejected, ctx))!.waitForIdle(ctx)
    expect((await entries(rejected))[0].data).toMatchObject({
      status: 'failed',
      text: expect.stringContaining('was not resent'),
    })
    expect(reopenedModels).toContain('sol')
    expect(reopenedModels).not.toContain('astra')

    const racing = await newCoordinator()
    const manualGate = Promise.withResolvers<void>()
    let manualEntered = false
    const raceRoute = ((request, _options, _state, model) => {
      faux.appendResponses([raceRoute])
      if (model.id === 'astra') {
        manualEntered = true
        return manualGate.promise.then(() => fauxAssistantMessage('Manual advisory advice'))
      }
      const last = request.messages.at(-1)
      if (
        last?.role === 'user' &&
        JSON.stringify(last.content).includes('Plan before implementation')
      )
        return ask('plan')
      return fauxAssistantMessage('Continued with the advice')
    }) satisfies Parameters<typeof faux.setResponses>[0][number]
    faux.setResponses([raceRoute])
    expect((await requestMode('plan', racing)).status).toBe(200)
    try {
      await until(() => manualEntered)
      const actor = (await server.harness.conversation(racing, ctx))!
      const beforeCall = faux.state.callCount
      const input = await actor.submit(
        { type: 'input', content: 'Plan before implementation' },
        ctx,
      )
      await until(() => faux.state.callCount > beforeCall)
      await until(
        async () =>
          (await server.harness.snapshot(Runs, racing, ctx))?.tasks.plan?.caller !== undefined,
      )
      expect(await input.status(ctx)).toMatchObject({ status: 'placed' })
      manualGate.resolve()
      await input.wait(ctx)
      await actor.waitForIdle(ctx)
      expect((await entries(racing))[0]?.data).toMatchObject({
        status: 'ready',
        text: 'Manual advisory advice',
      })
      const toolRows = await server.harness.commit(
        async (tx) =>
          (await tx.scanEntries({ conversationId: racing }, 40)).items
            .filter((entry) => entry.kind === 'pi.tool-result')
            .map((entry) => entry.model?.[0]?.content),
        ctx,
      )
      expect(JSON.stringify(toolRows)).toContain('Manual advisory advice')
      expect(
        await server.harness.commit(
          (tx) => tx.submissionByRequest(racing, 'coordinator-modes:plan'),
          ctx,
        ),
      ).toMatchObject({ type: 'write' })
      expect(await entries(racing)).toHaveLength(1)
    } finally {
      manualGate.resolve()
    }

    const late = await newCoordinator()
    const solGate = Promise.withResolvers<void>()
    let solWaiting = false
    let nextSawAdvice = false
    let paid = 0
    const lateRoute = ((request, _options, _state, model) => {
      faux.appendResponses([lateRoute])
      if (model.id === 'astra') {
        paid++
        return fauxAssistantMessage('Advice from the already finished manual request')
      }
      const sent = JSON.stringify(request.messages)
      if (sent.includes('Advice from the already finished manual request')) {
        nextSawAdvice = true
        return fauxAssistantMessage('Continued after using the advice')
      }
      if (sent.includes('Hold Sol before the checkpoint')) {
        solWaiting = true
        return solGate.promise.then(() => ask('plan'))
      }
      return fauxAssistantMessage('Noted')
    }) satisfies Parameters<typeof faux.setResponses>[0][number]
    faux.setResponses([lateRoute])
    const lateActor = (await server.harness.conversation(late, ctx))!
    const original = await lateActor.submit(
      { type: 'input', content: 'Hold Sol before the checkpoint' },
      ctx,
    )
    const manualDelivery = () =>
      server.harness.commit((tx) => tx.submissionByRequest(late, 'coordinator-modes:plan'), ctx)
    try {
      await until(() => solWaiting)
      expect((await requestMode('plan', late)).status).toBe(200)
      await until(async () => (await manualDelivery())?.status === 'queued')
      solGate.resolve()
      await original.wait(ctx)
      await lateActor.waitForIdle(ctx)
      expect(nextSawAdvice).toBe(true)
      expect(paid).toBe(1)
      expect(await manualDelivery()).toMatchObject({
        status: 'unanswered',
        reason: 'consumed_by_checkpoint',
      })
      expect(await entries(late)).toHaveLength(1)
    } finally {
      solGate.resolve()
    }

    expect((await set('review', true)).status).toBe(200)
    const replayPrompt = 'Prove automatic Review survives restart'
    const priorHead = runGit(checkout, 'rev-parse', 'HEAD')
    let reviewAttempts = 0
    let reviewPacket = ''
    let staleReachedTool = false
    const replayRoute = (async (request, options, state, model) => {
      faux.appendResponses([replayRoute])
      const last = request.messages.at(-1)
      const body = JSON.stringify(last?.content)
      if (model.id === 'astra') {
        reviewAttempts++
        if (reviewAttempts === 1) {
          reviewPacket = JSON.stringify(
            request.messages.filter((message) => message.role !== 'system'),
          )
          return held(request, options, state, model)
        }
        return fauxAssistantMessage('Unexpected repeated provider request')
      }
      if (last?.role === 'user' && body.includes('start-replay-branch'))
        return fauxAssistantMessage(
          fauxToolCall('branch', { prompt: replayPrompt, isolated: false }),
          { stopReason: 'toolUse' },
        )
      if (last?.role === 'user' && body.includes(replayPrompt)) {
        const requestToBranch = (await requests()).messages.find(
          (msg) => msg.text === replayPrompt && msg.from === starter,
        )!
        if (typeof requestToBranch.to !== 'number') throw new Error('Expected a branch target')
        const targetId = requestToBranch.to
        await server.harness.commit(async (tx) => {
          ;(await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).items[targetId] = {
            path: checkout,
            source: projectRoot,
            branch: 'fixture',
            base,
            target: 'main',
            state: 'ready',
          }
        }, ctx)
        return fauxAssistantMessage(
          fauxToolCall('advisory_checkpoint', {
            mode: 'review',
            revision: priorHead,
            brief: 'x'.repeat(12050),
          }),
          { stopReason: 'toolUse' },
        )
      }
      const sent = JSON.stringify(request.messages)
      if (sent.includes('Review advisory result (stale') && sent.includes(priorHead)) {
        staleReachedTool = true
        return fauxAssistantMessage('The original Review was stale after restart.')
      }
      return fauxAssistantMessage('Noted')
    }) satisfies Parameters<typeof faux.setResponses>[0][number]
    faux.setResponses([replayRoute])
    await (await server.harness.conversation(starter, ctx))!.submit(
      { type: 'input', content: 'start-replay-branch' },
      ctx,
    )
    await until(() => reviewAttempts === 1, 8000)
    expect(reviewPacket).toContain(priorHead)
    expect(reviewPacket).toContain('Change counts: 2 files changed')
    const replayRequest = (await requests()).messages.find(
      (msg) => msg.text === replayPrompt && msg.from === starter,
    )!
    expect((await requests()).messages.filter((msg) => msg.re === replayRequest.id)).toEqual([])
    expect((await set('review', false)).status).toBe(200)
    await server.close()
    runGit(
      checkout,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'Change checkout across restart',
    )
    server = await open()
    await until(async () => (await requests()).messages.some((msg) => msg.re === replayRequest.id))
    expect((await requests()).messages.filter((msg) => msg.re === replayRequest.id)).toEqual([
      expect.objectContaining({ text: 'The original Review was stale after restart.' }),
    ])
    expect(staleReachedTool).toBe(true)
    expect(reviewAttempts).toBe(1)
  } finally {
    await server.close()
    await rm(home, { recursive: true, force: true })
  }
})
