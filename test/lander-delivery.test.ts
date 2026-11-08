import { expect, it, vi } from 'vitest'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { createLander } from '../extensions/workspaces/lander.ts'
import { advanceDelivery, deliveryRuntime } from '../extensions/workspaces/delivery.ts'
import type { Delivery } from '../extensions/workspaces/delivery.ts'
import type { WorkspaceIndex } from '../extensions/workspaces/types.ts'
import { git } from '../lib/git.ts'

vi.mock('../lib/git.ts', () => ({ git: vi.fn<typeof git>() }))
vi.mock('../extensions/workspaces/delivery.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../extensions/workspaces/delivery.ts')>()),
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
        conversationId: 2,
        source: '/fixture',
        target: 'main',
        tip: 'a'.repeat(40),
        at: 1,
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
    snapshot: async () => structuredClone(index),
    memo: async () => ({ runtime: 'runtime-A' }),
    commit: async (update: (transaction: typeof tx) => unknown) => {
      const result = await update(tx)
      commits.push(result)
      return result
    },
  }
  const phase = createLander({} as never, {} as never, (_source, work) => work(), {} as never)
    .definition.phases.land
  const run = () =>
    phase(
      {
        input: { source: '/fixture' },
        state: { checkpoint: { phase: 'land', id: 'submission', attempt: 1 } },
      } as never,
      runtime as never,
      context,
    )
  return { index, commits, run }
}

it('continues when approval commits after its snapshot but before the transactional pause', async () => {
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
  expect(f.commits.at(-1)).toEqual({
    status: 'running',
    checkpoint: { phase: 'land', id: 'submission', attempt: 1 },
  })
  expect(f.index.queue[0].delivery?.mergeApproved).toBe(true)
  expect(f.index.queue[0].state).toBe('landing')
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
