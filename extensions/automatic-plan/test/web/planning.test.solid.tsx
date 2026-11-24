import { createAgent } from '@ui-sdk/solid/agent'
import { flush } from 'solid-js'
import type { Component } from 'solid-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { EntryRecord } from '@/sdk/solid'
import { writingAs } from '@/sdk/solid'
import { actions } from '@/sdk/actions.ts'
import { store } from '@/sdk/client.ts'
import { parseConversationId, parseEntryId } from '../../../../lib/ids.ts'
import { EVENT_FEED } from '../../../../shared/events.ts'
import type { EventRecord } from '../../../../shared/events.ts'
import { SOURCE_HEADER } from '../../../../shared/protocol.ts'
import { FakeSource, fakeSubscriptions } from '../../../../test/web/fake-source.ts'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'
import { PlanCard, PlanningThreadChanged, RevisionCard } from '../../refs.ts'
import type { Thread } from '../../refs.ts'
import facet from '../../web.solid.tsx'

const harness = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown; source: string | null; streamed: boolean }[],
  thread: {} as Thread,
  family: null as string | null,
  sources: [] as FakeSource[],
  server: undefined as ReturnType<typeof fakeSubscriptions> | undefined,
}))

vi.mock('@/sdk/client.ts', async () => {
  const { createApi } = await import('@/sdk/api.ts')
  const { createReads } = await import('@/sdk/reads.ts')
  const { createStore } = await import('@/sdk/store.ts')
  const { createUiState } = await import('@/sdk/ui-state.ts')
  const { answerReadsWith, fakeSubscriptions } = await import('../../../../test/web/fake-source.ts')
  const server = fakeSubscriptions(harness.sources)
  harness.server = server
  const fetch = answerReadsWith(async (input, init) => {
    const path = input as string
    const prefix = '/api/extensions/automatic-plan/actions/'
    if (!path.startsWith(prefix)) return server.handle(path, init) ?? Response.json({})
    const name = path.slice(prefix.length)
    const { args } = JSON.parse(init?.body as string) as { args: unknown }
    const headers = new Headers(init?.headers)
    harness.calls.push({
      name,
      args,
      source: headers.get(SOURCE_HEADER),
      streamed: headers.has('x-fake-read'),
    })
    if (name === 'readThread') return Response.json({ result: harness.thread })
    if (name === 'refine') harness.thread.turns.push({ prompt: (args as { text: string }).text })
    if (name === 'sendRevision') harness.thread.sending = (args as { revision: number }).revision
    if (name === 'settings')
      return Response.json({
        result: {
          family: harness.family,
          options: [{ family: 'Plan', provider: 'demo', id: 'planner', effort: 'low' }],
        },
      })
    if (name === 'setPlan') harness.family = args as string | null
    return Response.json({ result: null })
  })
  const liveStore = createStore({
    eventSource: (url) => {
      const source = new FakeSource(url)
      harness.sources.push(source)
      return source
    },
    fetch,
  })
  const api = createApi(liveStore, { fetch })
  return {
    api,
    store: liveStore,
    reads: createReads(api, liveStore),
    uiState: createUiState(undefined),
  }
})

const agent = createAgent()
const settings = facet.commands![0]
const fork = parseConversationId(24)
const coordinator = parseConversationId(1)
const feed: EventRecord[] = []
const eventSubscription = () =>
  harness.server?.subscriptions.findLast(({ docs }) => docs.includes(EVENT_FEED))
function notify(changed = fork) {
  feed.push({
    id: parseEntryId(feed.length + 1),
    name: PlanningThreadChanged.name,
    kind: PlanningThreadChanged.kind,
    v: PlanningThreadChanged.version,
    at: '2026-01-01T00:00:00Z',
    data: { fork: changed },
  })
  const subscription = eventSubscription()
  expect(subscription).toBeDefined()
  subscription!.send('doc', { kind: EVENT_FEED, value: { events: feed } })
}
const tick = async (ms = 0) => {
  flush()
  await vi.advanceTimersByTimeAsync(ms)
  flush()
}
const changes = () =>
  harness.calls.filter(({ name }) => ['refine', 'sendRevision', 'setPlan'].includes(name))
const personCall = (name: string, args: unknown) => ({
  name,
  args,
  source: 'person',
  streamed: false,
})

function card(kind: string) {
  const Renderer = facet.entries![kind]
  const entry = {
    id: parseEntryId(1),
    conversationId: coordinator,
    kind,
    createdAt: 0,
    data:
      kind === PlanCard.kind
        ? { fork, text: 'First plan' }
        : { fork, revision: 2, text: 'Delivered revision' },
  } as EntryRecord
  return renderSolid(() => <Renderer entry={entry} core={null} />)
}

function button(label: string) {
  const found = [...document.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === label || node.getAttribute('aria-label') === label,
  )
  expect(found).toBeDefined()
  return found!
}

beforeEach(async () => {
  vi.useFakeTimers()
  harness.calls.length = 0
  feed.length = 0
  harness.sources.length = 0
  harness.thread = { model: 'demo/planner', effort: 'low', turns: [{ answer: 'First plan' }] }
  harness.family = null
  store.start()
  harness.sources[0].open()
  await tick(10)
})

afterEach(() => {
  actions.close(settings.id)
  store.stop()
  vi.useRealTimers()
})

it('keeps the protected thread out of agent controls and reads it only in the open modal', async () => {
  const container = card(RevisionCard.kind)
  expect(container.textContent).toContain('Revised plan · 2')
  expect(container.textContent).toContain('Delivered revision')
  expect(agent.snapshot().some(({ label }) => label === 'Continue planning')).toBe(false)
  const attempt = agent.act({
    steps: [{ ref: 'Continue planning', action: 'setOpen', args: [true] }],
  })
  await tick(100)
  expect((await attempt).ok).toBe(false)
  expect(harness.calls).toEqual([])

  button('Continue planning').click()
  await tick()
  expect(harness.calls).toEqual([personCall('readThread', { fork })])
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('First plan')
  expect(agent.snapshot().some(({ offPage, label }) => !offPage && label === 'Refine plan')).toBe(
    false,
  )
  notify(parseConversationId(99))
  await tick()
  expect(harness.calls).toEqual([personCall('readThread', { fork })])
  harness.sources[0].drop()
  await tick()
  harness.sources[0].open()
  await tick()
  expect(harness.calls).toEqual([
    personCall('readThread', { fork }),
    personCall('readThread', { fork }),
  ])
  button('Close').click()
  await tick()
  notify()
  await tick()
  expect(harness.calls).toHaveLength(2)
})

it('keeps a draft across closing, displays a stopped turn, and sends only the completed revision', async () => {
  const container = card(PlanCard.kind)
  expect(container.textContent).toContain('First plan')
  button('Continue planning').click()
  await tick()
  const field = () =>
    document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Refine plan"]')!
  const type = (text: string) => {
    const el = field()
    el.setRangeText(text, 0, el.value.length)
    el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flush()
  }
  expect(field().maxLength).toBe(3000)
  type('What should I check first?')
  button('Close').click()
  await tick()
  button('Continue planning').click()
  await tick()
  expect(field().value).toBe('What should I check first?')
  button('Ask in planning thread').click()
  await tick()
  expect(changes()).toEqual([
    personCall('refine', { fork, after: 1, text: 'What should I check first?' }),
  ])
  expect(field().value).toBe('')
  expect(document.body.textContent).toContain('Planning…')

  type('Try again')
  const ask = () => button('Ask in planning thread')
  expect(ask().disabled).toBe(true)
  harness.thread.turns[1].error = 'Planning stopped'
  notify()
  await tick()
  expect(document.body.textContent).toContain('Planning stopped')
  expect(ask().disabled).toBe(false)
  ask().click()
  await tick()
  harness.thread.turns[2].answer = 'Start with the scoped check.'
  notify()
  await tick()
  button('Send revised plan').click()
  await tick()
  expect(changes().slice(1)).toEqual([
    personCall('refine', { fork, after: 2, text: 'Try again' }),
    personCall('sendRevision', { fork, revision: 2 }),
  ])
  expect(button('Send revised plan').disabled).toBe(true)
  delete harness.thread.sending
  harness.thread.sent = 2
  notify()
  await tick()
  expect(button('Revision sent').disabled).toBe(true)
  expect(
    harness.calls.filter(({ name }) => name === 'readThread').every(({ streamed }) => !streamed),
  ).toBe(true)
})

it('lets only a person change the project family, including Off', async () => {
  const [Overlay] = facet.slots!.overlay as Component[]
  renderSolid(() => <Overlay />)
  const context = { ...actions, surface: 'agent' }
  await writingAs('agent', () => settings.run(context))
  await tick()
  expect(harness.calls).toEqual([])
  harness.family = 'Removed family'
  await settings.run(context)
  await tick(10)
  const select = document.querySelector('select')!
  expect(select.value).toBe('Removed family')
  expect(select.selectedOptions[0].disabled).toBe(true)
  const change = (value: string) => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
  writingAs('agent', () => change('Plan'))
  expect(changes()).toEqual([])
  expect(select.value).toBe('Removed family')
  change('Plan')
  await tick(10)
  expect(select.value).toBe('Plan')
  change('')
  await tick(10)
  expect(select.value).toBe('')
  expect(changes()).toEqual([personCall('setPlan', 'Plan'), personCall('setPlan', null)])
})
