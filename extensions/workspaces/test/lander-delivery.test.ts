import type { ConversationId, EntryId } from '@earendil-works/pi-durable'
import { expect, it, vi } from 'vitest'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { createLander } from '../lander.ts'
import { advanceDelivery, deliveryRuntime } from '../advance.ts'
import { pick } from '../delivery.ts'
import { SubmissionFailed } from '../api.ts'
import { deliveryAsk } from '../ask.ts'
import type { Delivery } from '../delivery.ts'
import type { WorkspaceIndex } from '../types.ts'
import { git } from '../../../lib/git.ts'

vi.mock('../../../lib/git.ts', () => ({ git: vi.fn<typeof git>() }))
vi.mock('../advance.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../advance.ts')>()),
  advanceDelivery: vi.fn<typeof advanceDelivery>(),
  deliveryRuntime: vi.fn<() => string>(() => 'runtime-B'),
}))

function fixture(delivery?: Delivery) {
  const settings = {
    repository: 'example/my-app',
    remote: 'origin',
    base: 'main',
    checks: ['verify'],
    requiredChecks: ['verify'],
  }
  const index: WorkspaceIndex = {
    items: {},
    landers: {},
    landerConversations: {},
    results: {},
    queue: [
      {
        id: 'submission',
        conversationId: 2 as ConversationId,
        source: '/fixture',
        target: 'main',
        tip: 'a'.repeat(40),
        at: 1 as EntryId,
        divergence: 'None',
        state: 'landing',
        steps: [],
        ...(delivery ? { delivery } : { deliveryConfig: settings }),
      },
    ],
  }
  const commits: unknown[] = []
  const tx = { doc: async () => index, appendEntry: async () => undefined }
  const runtime = {
    signal: new AbortController().signal,
    conversationId: 28,
    now: () => 0,
    snapshot: async () => structuredClone(index),
    memo: async () => ({ runtime: 'runtime-A' }),
    commit: async (update: (transaction: typeof tx) => unknown) => {
      const result = await update(tx)
      commits.push(result)
      return result
    },
  }
  const emit = vi.fn<(...args: unknown[]) => void>()
  const { land, next } = createLander(
    {
      emit,
      harness: () => ({ commit: runtime.commit, conversation: async () => undefined }),
      doc: () => undefined,
      notice: () => undefined,
    } as never,
    {} as never,
    (_source, work) => work(),
    {} as never,
  ).definition.phases
  const run = (checkpoint = { phase: 'land', id: 'submission', attempt: 1 }) =>
    land(
      { input: { source: '/fixture' }, state: { checkpoint } } as never,
      runtime as never,
      context,
    )
  const schedule = () => next({ input: { source: '/fixture' } } as never, runtime as never, context)
  return { index, commits, emit, run, schedule }
}

it('parks through the scheduler, so an approval committed after its snapshot is picked up next', async () => {
  const delivery: Delivery = {
    settings: {
      repository: 'example/my-app',
      remote: 'origin',
      base: 'main',
      checks: ['verify'],
      requiredChecks: ['verify'],
    },
    candidate: 'a'.repeat(40),
    baseline: 'b'.repeat(40),
    tree: 'c'.repeat(40),
    branch: 'delivery/test',
    checkedAt: Date.now(),
    runtime: deliveryRuntime(),
    stage: 'merge',
    risk: 'medium',
    review: 'fixture',
    pr: 3,
  }
  const f = fixture(delivery)
  vi.mocked(advanceDelivery).mockImplementation(async (_source, snapshot) => {
    f.index.queue[0].delivery!.mergeApproved = true
    return snapshot
  })
  await f.run()
  expect(f.commits.at(-1)).toEqual({ status: 'running', checkpoint: { phase: 'next' } })
  expect(f.index.queue[0].delivery?.mergeApproved).toBe(true)
  expect(pick(f.index.queue, Date.now())).toEqual({ ready: 0 })
})

it.each(['merge', 'pr'] as const)(
  'refuses to record the %s write intent when approval is withdrawn mid-transition',
  async (stage) => {
    const f = fixture({
      settings: {
        repository: 'example/my-app',
        remote: 'origin',
        base: 'main',
        checks: ['verify'],
        requiredChecks: ['verify'],
      },
      candidate: 'a'.repeat(40),
      baseline: 'b'.repeat(40),
      tree: 'c'.repeat(40),
      branch: 'delivery/test',
      checkedAt: Date.now(),
      runtime: deliveryRuntime(),
      stage,
      risk: stage === 'merge' ? 'medium' : 'high',
      review: 'fixture',
      ...(stage === 'merge'
        ? { pr: 3, mergeApproved: true }
        : { published: true, publishApproved: true }),
    })
    const [flag, intent] =
      stage === 'merge'
        ? (['mergeApproved', 'mergeIntent'] as const)
        : (['publishApproved', 'createIntent'] as const)
    let saved: unknown
    vi.mocked(advanceDelivery).mockImplementation(async (_source, snapshot, save) => {
      delete f.index.queue[0].delivery![flag]
      saved = await save({ ...snapshot, [intent]: true }).catch((error: Error) => error.message)
      return snapshot
    })
    await f.run()
    expect(saved).toBe(
      stage === 'merge'
        ? 'Merge approval was withdrawn; approve again to merge'
        : 'Publish approval was withdrawn; approve again to publish',
    )
    expect(f.index.queue[0].delivery?.[intent]).toBeUndefined()
  },
)

it('routes a stale approval to the branch for verification instead of to the user', async () => {
  const stale: Delivery = {
    settings: {
      repository: 'example/my-app',
      remote: 'origin',
      base: 'main',
      checks: ['verify'],
      requiredChecks: ['verify'],
    },
    candidate: 'a'.repeat(40),
    baseline: 'b'.repeat(40),
    tree: 'c'.repeat(40),
    branch: 'delivery/test',
    checkedAt: 1,
    runtime: 'runtime-A',
    stage: 'publish',
    risk: 'high',
    review: 'fixture',
  }
  const f = fixture(stale)
  const actual = await vi.importActual<typeof import('../advance.ts')>('../advance.ts')
  const api = vi.fn<() => Promise<never>>(async () => {
    throw new Error('No GitHub call expected')
  })
  vi.mocked(advanceDelivery).mockImplementation((source, delivery, save, signal) =>
    actual.advanceDelivery(source, delivery, save, signal, api),
  )
  await f.schedule()
  const checkpoint = { phase: 'land', id: 'submission', attempt: 1, runtimeOnly: true }
  expect(f.commits.at(-1)).toEqual({ status: 'running', checkpoint })
  await f.run(checkpoint)
  expect(api).not.toHaveBeenCalled()
  expect(f.index.queue[0].delivery).toMatchObject({
    stage: 'blocked',
    cause: 'runtime',
    wake: { to: 'branch' },
  })
  expect(deliveryAsk(f.index.queue[0].delivery)).toBeUndefined()
  expect(deliveryAsk({ ...stale, runtime: 'runtime-B' })).toBe('approve-pr')
})

it('rejects a changed runtime before reading cached check results or touching Git', async () => {
  vi.mocked(git).mockClear()
  const f = fixture()
  await f.run()
  expect(git).not.toHaveBeenCalled()
  expect(f.index.results.submission).toMatchObject({
    outcome: 'failed',
    reason: 'verification runtime changed; submit again',
  })
  expect(f.index.queue).toEqual([])
})

it('reports a manual close as a terminal failure even when the merge waited for approval', async () => {
  const settings = {
    repository: 'example/my-app',
    remote: 'origin',
    base: 'main',
    checks: ['verify'],
    requiredChecks: ['verify'],
  }
  const d: Delivery = {
    settings,
    candidate: 'a'.repeat(40),
    baseline: 'b'.repeat(40),
    tree: 'c'.repeat(40),
    branch: 'ultimate-delivery/test',
    checkedAt: 1,
    runtime: deliveryRuntime(),
    stage: 'merge',
    risk: 'medium',
    review: 'review of fixture tree',
    pr: 3,
    url: 'https://github.com/example/my-app/pull/3',
  }
  const f = fixture(d)
  const actual = await vi.importActual<typeof import('../advance.ts')>('../advance.ts')
  const requests: string[] = []
  const api: import('../advance.ts').Github = async (path, method = 'GET') => {
    requests.push(`${method} ${path}`)
    return {
      number: 3,
      state: 'closed',
      merged: false,
      head: { sha: d.candidate, ref: d.branch, repo: { full_name: settings.repository } },
      base: { ref: settings.base, repo: { full_name: settings.repository } },
    } as never
  }
  vi.mocked(advanceDelivery).mockImplementation((source, delivery, save, signal) =>
    actual.advanceDelivery(
      source,
      { ...delivery, runtime: actual.deliveryRuntime() },
      save,
      signal,
      api,
    ),
  )
  await f.run()
  expect(requests).toEqual(['GET repos/example/my-app/pulls/3'])
  expect(f.index.queue).toEqual([])
  expect(f.index.closing).toBeUndefined()
  expect(f.index.results.submission).toMatchObject({
    outcome: 'failed',
    reason: 'Delivery PR was closed without merging',
    delivery: { cause: 'closed', stage: 'closed', pr: 3 },
  })
  expect(f.index.results.submission.delivery?.mergeApproved).toBeUndefined()
  expect(f.index.results.submission.delivery?.mergeIntent).toBeUndefined()
  expect(f.emit.mock.calls.map(([, event]) => event)).toEqual([SubmissionFailed])
  expect(f.commits.at(-1)).toMatchObject({ checkpoint: { phase: 'report', id: 'submission' } })
})
