import { createAgent } from '@ui-sdk/solid/agent'
import { flush } from 'solid-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { expectDistinctAgentNames } from '../../../../test/web/agent-names.ts'
import { answerReadsWith, FakeSource, fakeSubscriptions } from '../../../../test/web/fake-source.ts'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'
import { parseConversationId } from '../../../../lib/ids.ts'
import type { ModelsResponse, StreamedView } from '../../../../shared/protocol.ts'

const harness = vi.hoisted(() => ({
  sources: [] as FakeSource[],
  fetch: vi.fn<typeof fetch>(),
}))
vi.mock('../../../../web/src/sdk/client.ts', async () => {
  const { createStore } = await import('../../../../web/src/sdk/store.ts')
  const { createApi, readActionOf } = await import('../../../../web/src/sdk/api.ts')
  const { createUiState } = await import('../../../../web/src/sdk/ui-state.ts')
  const { createReads } = await import('../../../../web/src/sdk/reads.ts')
  const { createRegistry } = await import('../../../../web/src/sdk/registry.ts')
  const fetch = answerReadsWith(harness.fetch)
  const store = createStore({
    eventSource: (url) => {
      const stream = new FakeSource(url)
      harness.sources.push(stream)
      return stream
    },
    fetch,
  })
  const api = createApi(store, { fetch })
  return {
    store,
    api,
    reads: createReads(readActionOf(api), store),
    registry: createRegistry(),
    uiState: createUiState(undefined),
  }
})

import { actions, currentContext } from '../../../../web/src/sdk/actions.ts'
import { store } from '../../../../web/src/sdk/client.ts'
import { ConversationScope } from '../../../../web/src/sdk/solid.ts'
import { LoginDialog } from '../../login.solid.tsx'
import { ModelPicker } from '../../picker.solid.tsx'
import { PresetsButton, PresetsDialog } from '../../presets.solid.tsx'
import type { PresetView } from '../../refs.ts'
import { ModelButton, ThinkingButton } from '../../toolbar.solid.tsx'
import { openLogin } from '../../state.ts'
import models from '../../web.solid.tsx'

const agent = createAgent()
const server = fakeSubscriptions(harness.sources)
const side = parseConversationId(17)
const catalog: ModelsResponse = {
  providers: [
    {
      id: 'faux',
      name: 'Faux',
      authTypes: [{ type: 'api_key', name: 'Faux credentials' }],
      status: { configured: true, source: 'stored' },
      isUsingSubscription: false,
    },
  ],
  models: ['atlas', 'orion'].map((id) => ({
    provider: 'faux',
    id,
    name: id,
    contextWindow: 1000,
    maxTokens: 100,
    available: true,
    reasoning: true,
    thinkingLevels: ['off', 'low', 'high'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  })),
}

function view(id: number, modelId: string, thinkingLevel: string): StreamedView {
  return {
    conversation: { id },
    entries: [],
    docs: { 'pi.agent': { model: { provider: 'faux', modelId }, thinkingLevel } },
  } as unknown as StreamedView
}

async function sync() {
  await vi.advanceTimersByTimeAsync(25)
  flush()
}

beforeEach(async () => {
  vi.useFakeTimers()
  harness.sources.length = 0
  server.subscriptions.length = 0
  harness.fetch.mockReset()
  harness.fetch.mockImplementation(async (url, init) => {
    const path = url as string
    const subscription = server.handle(path, init)
    if (subscription) return subscription
    if (path === '/api/models') return Response.json(catalog)
    if (path.endsWith('/families'))
      return Response.json({
        result: {
          families: [{ name: 'Review', model: 'faux/atlas', thinking: 'high', color: 'blue' }],
        },
      })
    if (path.endsWith('/login')) return Response.json({ result: { flowId: 'flow-1' } })
    return Response.json({ result: null })
  })
  store.setUi({ dialogs: {} })
  store.show(undefined)
  store.start()
  harness.sources[0].open()
  await store.refreshModels()
  await sync()
  server.of()!.send('view', view(1, 'atlas', 'off'))
  await sync()
})

afterEach(() => {
  store.stop()
  vi.useRealTimers()
})

function refFor(label: string) {
  const entry = agent.snapshot().find((item) => !item.offPage && item.label === label)
  expect(entry).toBeDefined()
  return entry!.ref
}

async function act(label: string, action: string, ...args: unknown[]) {
  const result = agent.act({ steps: [{ ref: refFor(label), action, args }] })
  await vi.advanceTimersByTimeAsync(200)
  flush()
  return result
}

const writes = () =>
  harness.fetch.mock.calls.flatMap(([url, init]) => {
    const path = url as string
    if (
      !/\/(configure|setFamily|login|answer|cancel|savePreset|applyPreset|deletePreset)$/.test(path)
    )
      return []
    return [
      {
        path,
        body: JSON.parse(init!.body as string) as unknown,
        source: new Headers(init!.headers).get('x-ultimate-source'),
      },
    ]
  })

it('keeps the picked effort pending and ignores a quick second choice', async () => {
  const pending = Promise.withResolvers<Response>()
  const respond = harness.fetch.getMockImplementation()!
  harness.fetch.mockImplementation((url, init) =>
    typeof url === 'string' && url.endsWith('/configure') ? pending.promise : respond(url, init),
  )
  const page = renderSolid(() => <ThinkingButton />)
  expect(await act('Thinking level', 'setOpen', true)).toMatchObject({ ok: true })
  const high = page.querySelector<HTMLButtonElement>('[aria-label="high effort"]')!
  const low = page.querySelector<HTMLButtonElement>('[aria-label="low effort"]')!
  const off = page.querySelector<HTMLButtonElement>('[aria-label="off effort"]')!
  expect(off.getAttribute('aria-current')).toBe('true')
  expect(high.getAttribute('aria-current')).toBeNull()
  high.click()
  low.click()
  await sync()
  expect(high.hasAttribute('data-pending')).toBe(true)
  expect(low.disabled).toBe(true)
  expect(off.disabled).toBe(true)
  low.click()
  await sync()
  expect(writes()).toEqual([
    { path: '/api/conversations/1/configure', body: { thinkingLevel: 'high' }, source: 'person' },
  ])
  pending.resolve(Response.json({ ok: true }))
  await sync()
  expect(page.querySelector('[aria-label="high effort"]')).toBeNull()
})

it('lets an agent pick a model and a family by name, recording both writes as the agent', async () => {
  const container = renderSolid(() => (
    <>
      <ModelButton />
      <ModelPicker />
    </>
  ))
  await sync()
  expect(await act('Open the model picker', 'press')).toMatchObject({ ok: true })
  await expectDistinctAgentNames(agent)
  expect(container.querySelector('[data-highlighted][role="option"]')?.textContent).toContain(
    'atlas',
  )
  expect(await act('Search model catalog', 'setQuery', 'orion faux')).toMatchObject({ ok: true })
  expect(container.querySelector('[data-highlighted][role="option"]')?.textContent).toContain(
    'orion',
  )
  expect(await act('Search model catalog', 'run', 'faux/orion')).toMatchObject({ ok: true })
  expect(await act('Open the model picker', 'press')).toMatchObject({ ok: true })
  expect(await act('Search model catalog', 'run', 'Review')).toMatchObject({ ok: true })
  expect(writes()).toEqual([
    {
      path: '/api/conversations/1/configure',
      body: { model: { provider: 'faux', modelId: 'orion' } },
      source: 'agent',
    },
    {
      path: '/api/extensions/models/actions/setFamily',
      body: { args: { family: null }, conversationId: 1 },
      source: 'agent',
    },
    {
      path: '/api/conversations/1/configure',
      body: { model: { provider: 'faux', modelId: 'atlas' }, thinkingLevel: 'high' },
      source: 'agent',
    },
    {
      path: '/api/extensions/models/actions/setFamily',
      body: { args: { family: 'Review' }, conversationId: 1 },
      source: 'agent',
    },
  ])
})

it('targets the side chat from thinking controls and the picker, including after a provider login', async () => {
  const release = store.watchConversation(side)
  const container = renderSolid(() => (
    <>
      <ConversationScope value={side}>
        <ModelButton />
        <ThinkingButton />
      </ConversationScope>
      <ModelPicker />
      <LoginDialog />
    </>
  ))
  try {
    await sync()
    server.of(side, true)!.send('view', view(side, 'orion', 'low'))
    await sync()
    expect(container.querySelector('[aria-label="Open the model picker"]')?.textContent).toContain(
      'orion',
    )
    expect(await act('Thinking level', 'setOpen', true)).toMatchObject({ ok: true })
    await expectDistinctAgentNames(agent)
    expect(await act('high effort', 'press')).toMatchObject({ ok: true })
    const cycle = models.commands!.find((command) => command.id === 'model.thinking.cycle')!
    expect(cycle).toMatchObject({ keys: 'shift+tab', whileTyping: true })
    await cycle.run(currentContext(side))
    await cycle.run(currentContext())

    expect(await act('Open the model picker', 'press')).toMatchObject({ ok: true })
    expect(await act('Search model catalog', 'run', 'accounts/login')).toMatchObject({ ok: true })
    expect(await act('Faux credentials (API key, faux)', 'press')).toMatchObject({ ok: true })
    expect(server.of(1)?.docs ?? []).not.toContain('models.login')
    expect(server.of(side)?.docs).toContain('models.login')
    server.of(side)!.send('doc', {
      kind: 'models.login',
      value: {
        flows: { 'flow-1': { provider: 'faux', type: 'api_key', status: 'complete', events: [] } },
      },
    })
    await sync()
    expect(await act('Pick a model', 'press')).toMatchObject({ ok: true })
    expect(container.querySelector('[data-highlighted][role="option"]')?.textContent).toContain(
      'orion',
    )
    expect(await act('Search model catalog', 'run', 'faux/atlas')).toMatchObject({ ok: true })
    expect(writes()).toEqual([
      { path: '/api/conversations/17/configure', body: { thinkingLevel: 'high' }, source: 'agent' },
      {
        path: '/api/conversations/17/configure',
        body: { thinkingLevel: 'high' },
        source: 'person',
      },
      { path: '/api/conversations/1/configure', body: { thinkingLevel: 'low' }, source: 'person' },
      {
        path: '/api/extensions/models/actions/login',
        body: { args: { provider: 'faux', type: 'api_key' }, conversationId: 17 },
        source: 'agent',
      },
      {
        path: '/api/conversations/17/configure',
        body: { model: { provider: 'faux', modelId: 'atlas' } },
        source: 'agent',
      },
      {
        path: '/api/extensions/models/actions/setFamily',
        body: { args: { family: null }, conversationId: 17 },
        source: 'agent',
      },
    ])
  } finally {
    release()
  }
})

it('lets an agent start a provider login and answer a streamed secret prompt without reading it', async ({
  onTestFinished,
}) => {
  renderSolid(() => <LoginDialog />)
  openLogin(actions)
  await sync()
  await expectDistinctAgentNames(agent)
  expect(await act('Faux credentials (API key, faux)', 'press')).toMatchObject({ ok: true })
  const flow = {
    provider: 'faux',
    type: 'api_key',
    status: 'running',
    prompt: { type: 'secret', message: 'Provider API key' },
    events: [],
  }
  server.of(1)!.send('doc', { kind: 'models.login', value: { flows: { 'flow-1': flow } } })
  await sync()
  await expectDistinctAgentNames(agent)
  const changes = vi.fn<Parameters<typeof agent.subscribe>[0]>()
  onTestFinished(agent.subscribe(changes))
  const filled = await act('Provider API key', 'setValue', 'a-test-value')
  expect(filled).toMatchObject({ ok: true })
  expect(JSON.stringify([filled.values, agent.snapshot(), changes.mock.calls])).not.toContain(
    'a-test-value',
  )
  expect(JSON.stringify(filled.values)).toContain('[redacted]')
  expect(await act('Continue', 'press')).toMatchObject({ ok: true })
  expect(writes()).toEqual([
    {
      path: '/api/extensions/models/actions/login',
      body: { args: { provider: 'faux', type: 'api_key' }, conversationId: 1 },
      source: 'agent',
    },
    {
      path: '/api/extensions/models/actions/answer',
      body: { args: { flowId: 'flow-1', value: 'a-test-value' }, conversationId: 1 },
      source: 'agent',
    },
  ])
  expect(await act('Log in to a provider', 'setOpen', false)).toMatchObject({ ok: true })
  expect(writes().at(-1)).toEqual({
    path: '/api/extensions/models/actions/cancel',
    body: { args: { flowId: 'flow-1' }, conversationId: 1 },
    source: 'agent',
  })
})

it('cancels a running provider login on its original conversation when the view changes', async () => {
  renderSolid(() => <LoginDialog />)
  openLogin(actions)
  await sync()
  expect(await act('Faux credentials (API key, faux)', 'press')).toMatchObject({ ok: true })
  store.show(side)
  await sync()
  expect(writes().at(-1)).toEqual({
    path: '/api/extensions/models/actions/cancel',
    body: { args: { flowId: 'flow-1' }, conversationId: 1 },
    source: 'app',
  })
  expect(
    agent.snapshot().some((item) => !item.offPage && item.label === 'Log in to a provider'),
  ).toBe(false)
})

it('attributes cancellation to the agent even when login returns its flow id after close', async () => {
  const pending = Promise.withResolvers<Response>()
  const mockResponse = harness.fetch.getMockImplementation()!
  harness.fetch.mockImplementation((url, init) =>
    url === '/api/extensions/models/actions/login' ? pending.promise : mockResponse(url, init),
  )
  renderSolid(() => <LoginDialog />)
  openLogin(actions)
  await sync()
  expect(await act('Faux credentials (API key, faux)', 'press')).toMatchObject({ ok: true })
  expect(await act('Log in to a provider', 'setOpen', false)).toMatchObject({ ok: true })
  expect(writes().map(({ path }) => path)).toEqual(['/api/extensions/models/actions/login'])
  pending.resolve(Response.json({ result: { flowId: 'late' } }))
  await sync()
  expect(writes().at(-1)).toEqual({
    path: '/api/extensions/models/actions/cancel',
    body: { args: { flowId: 'late' }, conversationId: 1 },
    source: 'agent',
  })
})

it('saves, replaces and applies presets, updating the current row in both entry points', async () => {
  const preset = { families: {}, assign: {}, pins: { summaries: null, preview: 'faux/atlas' } }
  let presets: PresetView[] = []
  const respond = harness.fetch.getMockImplementation()!
  harness.fetch.mockImplementation((url, init) => {
    const path = url as string
    if (path.endsWith('/presets')) return Promise.resolve(Response.json({ result: { presets } }))
    if (path.endsWith('/savePreset')) {
      const {
        args: { name },
      } = JSON.parse(init!.body as string) as { args: { name: string } }
      presets = [{ name, preset, current: true, missing: [], orphans: [] }]
    }
    if (path.endsWith('/applyPreset')) presets = presets.map((row) => ({ ...row, current: true }))
    if (path.endsWith('/deletePreset')) presets = []
    return respond(url, init)
  })
  const page = renderSolid(() => (
    <>
      <PresetsButton />
      <PresetsDialog />
    </>
  ))
  const input = () =>
    page.querySelector<HTMLInputElement>('[aria-label="Search or name a preset"]')!
  const query = (next: string) => {
    input().setRangeText(next, 0, input().value.length, 'end')
    input().dispatchEvent(new InputEvent('input', { bubbles: true }))
    flush()
  }
  const row = (text: string) =>
    [...page.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
      item.textContent.includes(text),
    )!
  const command = models.commands!.find((item) => item.id === 'model.presets')!
  await command.run(currentContext())
  await sync()
  expect(page.textContent).toContain('No presets yet')
  query('Saved')
  expect(page.textContent).toContain('Save current as')
  row('Save current as').click()
  await sync()
  expect(row('Saved').getAttribute('title')).toContain('Previews pinned: faux/atlas')
  expect(row('Saved').querySelector('svg')?.classList.contains('text-brand')).toBe(true)
  query('Saved')
  expect(page.textContent).toContain('Replace')
  row('Replace').click()
  await sync()
  row('Saved').click()
  await sync()
  expect(writes().map(({ path }) => path.split('/').at(-1))).toEqual(['savePreset', 'savePreset'])

  presets = presets.map((item) => ({ ...item, current: false }))
  await expectDistinctAgentNames(agent)
  expect(await act('Presets', 'setOpen', true)).toMatchObject({ ok: true })
  expect(row('Saved').querySelector('svg')?.classList.contains('text-brand')).toBe(false)
  row('Saved').click()
  await sync()
  expect(writes().at(-1)).toEqual({
    path: '/api/extensions/models/actions/applyPreset',
    body: { args: { name: 'Saved' }, conversationId: 1 },
    source: 'person',
  })
  expect(await act('Presets', 'setOpen', true)).toMatchObject({ ok: true })
  expect(row('Saved').querySelector('svg')?.classList.contains('text-brand')).toBe(true)
  page.querySelector<HTMLButtonElement>('[aria-label="Delete Saved"]')!.click()
  await sync()
  expect(writes().at(-1)?.path).toMatch(/\/applyPreset$/)
  page.querySelector<HTMLButtonElement>('[aria-label="Confirm delete Saved"]')!.click()
  await sync()
  expect(writes().at(-1)).toEqual({
    path: '/api/extensions/models/actions/deletePreset',
    body: { args: { name: 'Saved' }, conversationId: 1 },
    source: 'person',
  })
  expect(page.textContent).toContain('No presets yet')
})
