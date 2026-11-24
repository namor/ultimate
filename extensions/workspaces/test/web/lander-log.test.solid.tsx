import { settle } from '@ui-sdk/core/testing'
import { createAgent } from '@ui-sdk/solid/agent'
import { flush } from 'solid-js'
import { expect, it, vi } from 'vitest'
import type { EntryRecord, ToolCallView } from '@/sdk/solid'
import { ConversationScope, events, ROOT } from '@/sdk/solid'
import { provide } from '@/sdk/types.ts'
import { parseConversationId, parseEntryId } from '../../../../lib/ids.ts'
import { SOURCE_HEADER } from '../../../../shared/protocol.ts'
import type { SystemInfo } from '../../../../shared/protocol.ts'
import { expectDistinctAgentNames } from '../../../../test/web/agent-names.ts'
import { FakeSource, fakeSubscriptions } from '../../../../test/web/fake-source.ts'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'
import { registry, store, uiState } from '../../../../web/src/sdk/client.ts'
import { writerNow } from '../../../../web/src/sdk/writer.ts'
import { WorkspaceCall } from '../../call.solid.tsx'
import { EmptyLander, LanderComposer } from '../../lander-composer.solid.tsx'
import { LandingNote } from '../../landing-note.solid.tsx'
import { Review } from '../../landing-points.ts'
import { LandingCard } from '../../landing.solid.tsx'
import { LanderLogEntry, LanderReport } from '../../log.solid.tsx'
import { WorkspacesDoc } from '../../refs.ts'
import type { Delivery } from '../../delivery.ts'
import type { LanderStep, QueueEntry, StandingGrant, WorkspaceIndex } from '../../types.ts'
import facet from '../../web.solid.tsx'

const harness = vi.hoisted(() => ({
  sources: [] as FakeSource[],
  server: undefined as ReturnType<typeof fakeSubscriptions> | undefined,
  writes: vi.fn<(action: string, body: unknown, source: string | null) => void>(),
}))
vi.mock('../../../../web/src/sdk/client.ts', async () => {
  const { createStore } = await import('../../../../web/src/sdk/store.ts')
  const { createApi } = await import('../../../../web/src/sdk/api.ts')
  const { createReads } = await import('../../../../web/src/sdk/reads.ts')
  const { createRegistry } = await import('../../../../web/src/sdk/registry.ts')
  const { createUiState } = await import('../../../../web/src/sdk/ui-state.ts')
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = input as string
    if (path === '/api/extensions/workspaces/actions/github')
      return Response.json({ result: 'sample/project' })
    if (/\/actions\/(delivery|standing)$/.test(path)) {
      harness.writes(
        path.split('/').at(-1)!,
        JSON.parse(init!.body as string),
        new Headers(init?.headers).get(SOURCE_HEADER),
      )
      return Response.json({ result: null })
    }
    return harness.server?.handle(path, init) ?? Response.json({ ok: true })
  }
  const { answerReadsWith } = await import('../../../../test/web/fake-source.ts')
  const pageFetch = answerReadsWith(fetch)
  const clientStore = createStore({
    eventSource: (url) => {
      const stream = new FakeSource(url)
      harness.sources.push(stream)
      return stream
    },
    fetch: pageFetch,
  })
  const api = createApi(clientStore, { fetch: pageFetch })
  return {
    store: clientStore,
    api,
    reads: createReads(api, clientStore),
    registry: createRegistry(),
    reportCompact: () => {},
    uiState: createUiState(undefined),
  }
})

const agent = createAgent()
harness.server = fakeSubscriptions(harness.sources)
const branch = parseConversationId(43)
const lander = parseConversationId(71)

it("folds a standing agent's landing to its @name, not the feature it carried at submit time", async ({
  onTestFinished,
}) => {
  const other = parseConversationId(60)
  await registry.setLoaders({
    'extensions/compact/web.solid.tsx': async () => ({
      default: { compact: { when: () => true } },
    }),
  })
  store.start()
  const stream = harness.sources.at(-1)!
  stream.open()
  stream.send('conversations', [
    { id: branch, title: '@ultimate', label: 'agent', busy: false },
    { id: other, title: 'Fold cards in the chat', busy: false },
  ])
  onTestFinished(() => store.stop())
  await settle()
  const landing = (from: typeof branch, card: number) => (
    <LandingCard
      card={card}
      from={from}
      headline="Landed"
      sha="5e1f0a2abc"
      subject={{ feature: 'Chat Cards', title: 'Fold cards in the chat' }}
      tone="landed"
    />
  )
  const container = renderSolid(() => (
    <ConversationScope value={branch}>
      {landing(branch, 43)}
      {landing(other, 60)}
    </ConversationScope>
  ))
  const summary = (card: number) =>
    container.querySelector(`button[aria-label="Toggle landing card #${card}"]`)?.textContent
  expect(summary(43)).toContain('@ultimate')
  expect(summary(43)).not.toContain('Chat Cards')
  expect(summary(60)).toContain('Chat Cards')
  expect(summary(60)).toContain('Fold cards in the chat')
})

it('replaces running checks as results arrive, leaving their unfinished siblings spinning', async ({
  onTestFinished,
}) => {
  store.start()
  const stream = harness.sources.at(-1)!
  stream.open()
  onTestFinished(() => store.stop())
  const call: ToolCallView = {
    id: 'submit-1',
    name: 'workspace',
    status: 'done',
    args: { action: 'submit' },
    images: [],
    diagnostics: [],
    output: JSON.stringify({ id: 'submit', lander, text: 'Submitted' }),
  }
  const container = renderSolid(() => <WorkspaceCall call={call} />)
  await settle()
  const steps = [
    { step: 'setting up', at: 1_000 },
    { step: 'checking: a', at: 2_000, runs: 'a' },
    { step: 'checking: b', at: 3_000, runs: 'b' },
    { step: 'checked: a', at: 4_000, check: { command: 'a', result: 'passed', summary: 'a ok' } },
  ] satisfies LanderStep[]
  const publish = async (next: LanderStep[]) => {
    const value: WorkspaceIndex = {
      items: {},
      results: {},
      landers: {},
      landerConversations: {},
      queue: [
        {
          id: 'submit',
          source: '/repo',
          target: 'main',
          tip: 'abcdef0',
          state: 'landing',
          at: parseEntryId(50),
          conversationId: branch,
          divergence: '',
          steps: next,
        },
      ],
    }
    harness.server!.of(ROOT)!.send('doc', { kind: WorkspacesDoc.kind, value })
    await settle()
    flush()
  }
  const running = () =>
    [...container.querySelectorAll('.animate-spin')]
      .filter((icon) => icon.parentElement?.querySelector('time'))
      .map((icon) => icon.nextElementSibling?.textContent)
  const duration = (label: string) =>
    [...container.querySelectorAll('time')]
      .map((time) => time.parentElement)
      .find((row) => row?.textContent?.includes(label))
      ?.querySelector('.tabular-nums')?.textContent
  await publish(steps)
  expect(container.textContent).toContain('a · a ok')
  expect(container.textContent).not.toContain('checking: a')
  expect(running()).toEqual(['checking: b'])
  expect(duration('setting up')).toBe('2.0s')
  expect(duration('a · a ok')).toBe('2.0s')
  await publish([
    ...steps,
    { step: 'checked: b', at: 7_000, check: { command: 'b', result: 'failed' } },
  ])
  expect(container.textContent).toContain('b · failed')
  expect(container.textContent).not.toContain('checking: b')
  expect(duration('setting up')).toBeUndefined()
  expect(duration('b · failed')).toBe('4.0s')
  expect(running()).toEqual([])
  const advance = { step: 'fast-forwarding', at: 8_000 }
  await publish([
    ...steps,
    { step: 'checked: b', at: 7_000, check: { command: 'b', result: 'failed' } },
    advance,
  ])
  expect(running()).toEqual(['fast-forwarding'])
})

it('lets an agent open the review range, expand the landing state, and switch to the branch', async ({
  onTestFinished,
}) => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  onTestFinished(() => {
    vi.unstubAllGlobals()
    store.stop()
  })
  store.start()
  harness.sources.at(-1)!.open()
  await registry.setLoaders({ 'extensions/review/web.solid.tsx': async () => ({ default: {} }) })
  const entry = {
    id: 89,
    kind: 'lineage.note',
    data: {
      source: 'lander',
      text: 'Landed',
      from: branch,
      at: 42,
      base: '1234567',
      sha: 'abcdef0',
      target: 'main',
      title: 'Build the fold',
      commits: [{ sha: 'abcdef0', subject: 'Ship fold' }],
      more: 0,
      paths: ['fold.ts'],
      abstract: { at: 41, text: 'The branch has a working fold.' },
    },
  } as unknown as EntryRecord
  const container = renderSolid(() => <LandingNote core={null} entry={entry} />)
  await settle()
  const findControl = (label: string) =>
    agent.snapshot().find((item) => !item.offPage && item.label === label)
  const reviewLabel = 'Review landing #89: 1234567...abcdef0'
  expect(findControl(reviewLabel)).toBeUndefined()
  expect(findControl('Compare landing #89: 1234567...abcdef0 on DiffsHub')).toBeDefined()

  const open = vi.fn<(spec: string, source: string) => void>()
  await registry.setLoaders({
    'extensions/local-review/web.solid.tsx': async () => ({
      default: {
        provides: [provide(Review, (spec) => () => () => open(spec(), writerNow()))],
      },
    }),
  })
  await settle()
  await expectDistinctAgentNames(agent)
  const emitted = vi.fn<() => void>()
  onTestFinished(events.on('review:open', emitted))
  const control = (label: string) => findControl(label)!.ref
  expect(findControl(reviewLabel)).toBeDefined()
  expect(
    await agent.act({ steps: [{ ref: control(reviewLabel), action: 'press' }] }),
  ).toMatchObject({
    ok: true,
  })
  expect(open).toHaveBeenCalledExactlyOnceWith('1234567...abcdef0', 'agent')
  expect(emitted).not.toHaveBeenCalled()
  expect(
    await agent.act({
      steps: [{ ref: control('State at landing #89'), action: 'setOpen', args: [true] }],
    }),
  ).toMatchObject({ ok: true })
  expect(container.textContent).toContain('The branch has a working fold.')
  expect(
    await agent.act({
      steps: [{ ref: control('Open branch from landing row #89: #43/42'), action: 'press' }],
    }),
  ).toMatchObject({ ok: true })
  expect(uiState.get('shell.conversation')).toBe(branch)
})

const project = '/projects/my-app'
const integration = '/tmp/my-app-integration'
const queueEntry: QueueEntry = {
  id: 'deliver',
  source: integration,
  target: 'main',
  tip: '1234567',
  state: 'waiting',
  at: parseEntryId(50),
  conversationId: branch,
  divergence: '',
  steps: [],
}

async function publishIndex(overrides: Partial<WorkspaceIndex>) {
  const value: WorkspaceIndex = {
    items: {},
    results: {},
    landers: {},
    landerConversations: {},
    queue: [],
    ...overrides,
  }
  harness.server!.of(ROOT)!.send('doc', { kind: WorkspacesDoc.kind, value })
  await settle()
  flush()
}

it('renders candidate and wait changes and binds person-only decisions to the displayed candidate and tree', async ({
  onTestFinished,
}) => {
  store.start()
  harness.sources.at(-1)!.open()
  onTestFinished(() => store.stop())
  harness.writes.mockClear()
  const call: ToolCallView = {
    id: 'delivery-call',
    name: 'workspace',
    status: 'done',
    args: { action: 'submit' },
    images: [],
    diagnostics: [],
    output: JSON.stringify({ id: queueEntry.id, lander, text: 'Submitted' }),
  }
  const container = renderSolid(() => <WorkspaceCall call={call} />)
  await settle()
  const candidate = 'a'.repeat(40)
  const tree = 'b'.repeat(40)
  const delivery: Delivery = {
    settings: {
      repository: 'sample/project',
      base: 'main',
      remote: 'origin',
      checks: ['test'],
      requiredChecks: ['CI'],
    },
    stage: 'review',
    candidate,
    tree,
    risk: 'high',
    review: 'pending',
    baseline: 'c'.repeat(40),
    branch: 'ultimate-delivery/deliver',
    checkedAt: Date.now(),
    runtime: 'test',
  }
  const grant: StandingGrant = {
    instruction: parseEntryId(42),
    conversation: branch,
    at: Date.now(),
    until: Date.now() + 60_000,
  }
  const card = () => container.querySelector('section[aria-label^="PR delivery"]')!
  const publish = (next: Partial<Delivery>, standing = grant) =>
    publishIndex({ queue: [{ ...queueEntry, delivery: { ...delivery, ...next } }], standing })
  await publish({})
  expect(container.textContent).toContain('Awaiting independent review')
  expect(card().textContent).toContain(tree)
  expect(card().querySelector('code')?.title).toBe(candidate)
  expect(card().textContent).toContain('sample/project → main')
  await publish({ stage: 'publish' })
  expect(card().getAttribute('data-delivery-ask')).toBe('publish')
  expect(card().textContent).toContain('Standing approval until')
  await expectDistinctAgentNames(agent)
  const press = async (label: string) => {
    const control = agent.snapshot().find((item) => !item.offPage && item.label === label)!
    expect(await agent.act({ steps: [{ ref: control.ref, action: 'press' }] })).toMatchObject({
      ok: false,
    })
    expect(harness.writes).not.toHaveBeenCalled()
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
    await settle()
  }
  const action = async (label: string, request: string, sha = candidate, shaTree = tree) => {
    harness.writes.mockClear()
    await press(`${label} for workspace call delivery-call`)
    expect(harness.writes).toHaveBeenCalledExactlyOnceWith(
      'delivery',
      {
        args: { action: request, id: queueEntry.id, candidate: sha, tree: shaTree },
        conversationId: ROOT,
      },
      'person',
    )
  }
  await action('Approve publication', 'publish')
  const url = 'https://github.com/sample/project/pull/7'
  const nextCandidate = 'd'.repeat(40)
  const nextTree = 'e'.repeat(40)
  await publish({ stage: 'ci', url, pr: 7, reruns: 1, candidate: nextCandidate, tree: nextTree })
  expect(container.textContent).toContain('Waiting for GitHub checks')
  expect(card().textContent).toContain('1/2 reruns used')
  expect(card().querySelector('a')?.getAttribute('href')).toBe(url)
  await publish({ stage: 'merge', url, pr: 7, candidate: nextCandidate, tree: nextTree })
  await action('Approve merge', 'merge', nextCandidate, nextTree)
  await publish({ stage: 'blocked', resumeStage: 'merge', reason: 'Approval needed', url, pr: 7 })
  expect(card().textContent).toContain('Approval needed')
  await action('Recheck outcome', 'recheck')
  await action('Stop delivery · close its PR', 'stop')
  harness.writes.mockClear()
  await press('Revoke standing approval from workspace call delivery-call')
  expect(harness.writes).toHaveBeenCalledExactlyOnceWith(
    'standing',
    { args: { revoke: true }, conversationId: ROOT },
    'person',
  )
  await publish({ stage: 'merge' }, { ...grant, revokedAt: Date.now() })
  expect(card().textContent).not.toContain('Standing approval until')
})

it('uses an empty log and read-only composer only for the selected checkout lander', async ({
  onTestFinished,
}) => {
  store.start()
  const stream = harness.sources.at(-1)!
  stream.open()
  stream.send('system', {
    project: { root: project, name: 'my-app', config: false, decision: null, settings: {} },
  } as SystemInfo)
  onTestFinished(() => store.stop())
  const extraLander = parseConversationId(72)
  const row = (id: typeof branch) => (
    <ConversationScope value={id}>
      <LanderComposer core={<textarea aria-label="Chat composer" />} />
      <EmptyLander conversation={id} core={<div>Default welcome</div>} />
    </ConversationScope>
  )
  const container = renderSolid(() => (
    <>
      {row(lander)}
      {row(extraLander)}
      {row(branch)}
    </>
  ))
  await settle()
  await publishIndex({
    landerConversations: { [project]: lander, [integration]: extraLander },
    queue: [queueEntry, { ...queueEntry, id: 'queued', state: 'queued' }],
  })
  const composer = (id: number) => container.querySelector(`[data-lander-log="${id}"]`)?.textContent
  expect(composer(lander)).toContain('Project checkout')
  expect(composer(lander)).toContain('Idle')
  expect(composer(lander)).not.toContain('queued')
  expect(composer(extraLander)).toContain(integration)
  expect(composer(extraLander)).toContain('Waiting on delivery · 1 queued')
  expect(container.querySelectorAll('textarea')).toHaveLength(1)
  expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
    'No landings yet',
    'No landings yet',
  ])
  expect(container.textContent).toContain('Default welcome')
  expect(facet.tools?.workspace).toBe(WorkspaceCall)
  expect(facet.entries?.['lineage.note']).toBe(LandingNote)
  expect(facet.entries?.['ultimate.lander']).toBe(LanderLogEntry)
  expect(facet.entries?.['workspaces.lander-report']).toBe(LanderReport)
})

it('renders a retained landing report without a step list', async ({ onTestFinished }) => {
  store.start()
  harness.sources.at(-1)!.open()
  onTestFinished(() => store.stop())
  const entry = {
    id: 89,
    kind: 'workspaces.lander-report',
    data: {
      id: 'old-report',
      outcome: {
        conversationId: branch,
        lander,
        outcome: 'failed',
        reason: 'Verification failed',
        target: 'main',
      },
    },
  } as unknown as EntryRecord
  const container = renderSolid(() => <LanderReport entry={entry} />)
  await settle()
  expect(container.querySelector('[data-lander-report="failed"]')?.textContent).toContain(
    'Verification failed',
  )
})
