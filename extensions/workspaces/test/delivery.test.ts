import { describe, expect, it, vi } from 'vitest'
import {
  advanceDelivery,
  deliveryRuntime,
  github,
  GithubRequestError,
  observePullOutcome,
} from '../advance.ts'
import type { Delivery } from '../delivery.ts'
import type { Github } from '../advance.ts'
import { exec } from '../../../lib/exec.ts'
import { git } from '../../../lib/git.ts'

vi.mock('../../../lib/git.ts', () => ({ git: vi.fn<typeof git>() }))
vi.mock('../../../lib/exec.ts', () => ({ exec: vi.fn<typeof exec>() }))
const candidate = 'a'.repeat(40)
const baseline = 'b'.repeat(40)
const merged = 'c'.repeat(40)
const tree = 'd'.repeat(40)
const makeDelivery = (): Delivery => ({
  settings: {
    repository: 'example/my-app',
    remote: 'origin',
    base: 'main',
    checks: ['pnpm verify'],
    requiredChecks: ['verify'],
  },
  candidate,
  baseline,
  tree,
  branch: 'ultimate-delivery/test',
  checkedAt: 1,
  runtime: deliveryRuntime(),
  risk: 'low',
  review: 'Independent reviewer #2, exact candidate approved',
  stage: 'publish',
})
const pull = (done = false) => ({
  number: 3,
  html_url: 'https://github.com/example/my-app/pull/3',
  state: done ? 'closed' : 'open',
  merged: done,
  merge_commit_sha: done ? merged : null,
  head: { sha: candidate, ref: 'ultimate-delivery/test', repo: { full_name: 'example/my-app' } },
  base: { ref: 'main', sha: baseline, repo: { full_name: 'example/my-app' } },
})
const refs = (branch: string, sha: string) => [
  { ref: `refs/heads/${branch}`, object: { type: 'commit', sha } },
]
const baseRef = 'repos/example/my-app/git/matching-refs/heads/main'
const deliveryRef = 'repos/example/my-app/git/matching-refs/heads/ultimate-delivery/test'
const protection = {
  enforce_admins: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
  required_pull_request_reviews: { required_approving_review_count: 0 },
  required_status_checks: { strict: true, checks: [{ context: 'verify', app_id: 1 }] },
}

describe('PR delivery', () => {
  it.each(['number', 'head', 'branch', 'base', 'repository'] as const)(
    'holds a purported terminal PR with a different %s',
    async (field) => {
      const d = { ...makeDelivery(), pr: 3, stage: 'ci' as const }
      const response = pull(true)
      switch (field) {
        case 'number':
          response.number++
          break
        case 'head':
          response.head.sha = baseline
          break
        case 'branch':
          response.head.ref = 'unrelated'
          break
        case 'base':
          response.base.ref = 'unrelated'
          break
        case 'repository':
          response.base.repo.full_name = 'example/unrelated'
          break
      }
      const requests: string[] = []
      const api: Github = async (path, method = 'GET') => {
        requests.push(`${method} ${path}`)
        return response as never
      }
      await expect(
        observePullOutcome('/project', d, new AbortController().signal, api),
      ).rejects.toThrow('PR identity changed')
      expect(requests).toEqual(['GET repos/example/my-app/pulls/3'])
    },
  )
  it.each([false, true])(
    'does not merge after the final PR read reports a different base commit (closed: %s)',
    async (closed) => {
      const d: Delivery = { ...makeDelivery(), pr: 3, stage: 'merge' }
      const requests: string[] = []
      let reads = 0
      const api: Github = async (path, method = 'GET') => {
        requests.push(method)
        if (path === baseRef) return refs('main', baseline) as never
        if (path.endsWith('/protection')) return protection as never
        if (path.includes('/check-runs'))
          return {
            total_count: 1,
            check_runs: [
              {
                name: 'verify',
                head_sha: candidate,
                status: 'completed',
                conclusion: 'success',
                app: { id: 1, slug: 'github-actions' },
              },
            ],
          } as never
        const response = pull()
        if (++reads > 1) {
          response.base.sha = merged
          if (closed) response.state = 'closed'
        }
        return response as never
      }
      const result = await advanceDelivery(
        '/project',
        d,
        async () => {},
        new AbortController().signal,
        api,
      )
      expect(result.stage).toBe(closed ? 'closed' : 'blocked')
      expect(result.cause).toBe(closed ? 'closed' : 'safety')
      expect(result.mergeIntent).toBeUndefined()
      expect(requests).not.toContain('PUT')
    },
  )

  it.each(['create', 'merge'] as const)(
    'can retry a definitively rejected %s without retaining a false uncertain intent',
    async (operation) => {
      let saved: Delivery = {
        ...makeDelivery(),
        stage: operation === 'create' ? 'pr' : 'merge',
        ...(operation === 'merge' ? { pr: 3 } : {}),
      }
      let writes = 0
      let done = false
      const api: Github = async (path, method) => {
        if (path === baseRef) return refs('main', baseline) as never
        if (path.includes('/pulls?')) return [] as never
        if (path.endsWith('/protection')) return protection as never
        if (path.includes('/check-runs'))
          return {
            total_count: 1,
            check_runs: [
              {
                name: 'verify',
                head_sha: candidate,
                status: 'completed',
                conclusion: 'success',
                app: { id: 1, slug: 'github-actions' },
              },
            ],
          } as never
        if (method === 'POST' || method === 'PUT') {
          writes++
          if (writes === 1) throw new GithubRequestError(operation === 'create' ? 422 : 405)
          done = true
          return (operation === 'create' ? pull() : { merged: true, sha: merged }) as never
        }
        return pull(done) as never
      }
      const save = async (d: Delivery) => {
        saved = structuredClone(d)
      }
      const signal = new AbortController().signal
      await advanceDelivery('/project', saved, save, signal, api)
      expect(saved).toMatchObject({ stage: 'blocked', cause: 'safety' })
      expect(saved.createIntent).toBeUndefined()
      expect(saved.mergeIntent).toBeUndefined()
      saved.stage = saved.resumeStage!
      await advanceDelivery('/project', saved, save, signal, api)
      if (operation === 'merge') await advanceDelivery('/project', saved, save, signal, api)
      expect(saved.stage).toBe(operation === 'create' ? 'ci' : 'merged')
      expect(writes).toBe(2)
    },
  )

  it.each(['publish', 'merge', 'intent before a manual merge'] as const)(
    'reconciles an interrupted %s without repeating its external write',
    async (operation) => {
      const stage = operation === 'publish' ? 'publish' : 'merge'
      const manual = operation === 'intent before a manual merge'
      let saved: Delivery = { ...makeDelivery(), stage, ...(stage === 'merge' ? { pr: 3 } : {}) }
      let happened = false
      let green = true
      let writes = 0
      const controller = new AbortController()
      vi.mocked(git).mockImplementation(async (...args) => {
        if (args.includes('get-url')) return 'git@github.com:example/my-app.git'
        if (args.includes('push')) {
          writes++
          happened = true
          controller.abort(new Error('interrupted'))
          throw new Error('lost push response')
        }
        if (args.includes('--format=%P')) return `${baseline} ${candidate}`
        if (args.includes('rev-parse')) return tree
        return ''
      })
      const api: Github = async (path, method) => {
        if (path === baseRef) return refs('main', baseline) as never
        if (path.endsWith('/git/ref/heads/main')) return refs('main', merged)[0] as never
        if (path === deliveryRef) return (happened ? refs(saved.branch, candidate) : []) as never
        if (path.endsWith('/protection')) return protection as never
        if (path.includes('/check-runs'))
          return {
            total_count: 1,
            check_runs: [
              {
                name: 'verify',
                head_sha: candidate,
                status: 'completed',
                conclusion: green ? 'success' : 'failure',
                app: { id: 1, slug: 'github-actions' },
              },
            ],
          } as never
        if (method === 'PUT') {
          writes++
          happened = true
          controller.abort(new Error('interrupted'))
          throw new Error('lost merge response')
        }
        return pull(happened) as never
      }
      const save = async (d: Delivery) => {
        saved = structuredClone(d)
        if (manual && d.mergeIntent && !happened) {
          controller.abort(new Error('interrupted'))
          happened = true
        }
      }
      await expect(
        advanceDelivery('/project', saved, save, controller.signal, api),
      ).rejects.toThrow('interrupted')
      let rejected: Delivery | undefined
      if (manual) {
        green = false
        rejected = await advanceDelivery('/project', saved, save, new AbortController().signal, api)
        green = true
        saved.stage = saved.resumeStage!
      }
      expect(rejected?.stage).toBe(manual ? 'blocked' : undefined)
      expect(rejected?.cause).toBe(manual ? 'safety' : undefined)
      expect(rejected?.mergeIntent).toBe(manual ? true : undefined)
      expect(rejected?.merged).toBeUndefined()
      await advanceDelivery(
        '/project',
        structuredClone(saved),
        save,
        new AbortController().signal,
        api,
      )
      expect(writes).toBe(manual ? 0 : 1)
      expect(saved.stage).toBe(stage === 'publish' ? 'pr' : 'merged')
      expect(saved.observedMerge).toEqual(
        stage === 'merge' ? { targetTip: merged, parent: baseline } : undefined,
      )
      expect(saved.mergeReceipt).toBeUndefined()
      expect(saved.decisions?.at(-1)?.what).toBe(
        stage === 'merge' ? 'observed GitHub merge after recorded intent' : 'reconcile publication',
      )
    },
  )

  it.each(['low', 'medium', 'high'] as const)(
    '%s risk merges the exact checked candidate only with the required approval',
    async (risk) => {
      vi.mocked(git).mockClear()
      const copy = {
        title: 'Keep the original run on retry',
        body: 'Retry now returns the original run.',
      }
      let saved: Delivery = { ...makeDelivery(), risk, pullRequest: copy }
      let checkHead = risk === 'high' ? baseline : candidate
      let created = false
      let done = false
      const writes: { intent: boolean | undefined; fields?: Record<string, string> }[] = []
      vi.mocked(git).mockImplementation(async (...args) => {
        if (args.includes('get-url')) return 'git@github.com:example/my-app.git'
        if (args.includes('ls-remote')) throw new Error('Fetch mirror is not authoritative')
        return ''
      })
      const api: Github = async (path, method, fields) => {
        if (path === baseRef) return refs('main', baseline) as never
        if (path === deliveryRef) return [] as never
        if (path.includes('/pulls?')) return (created ? [pull()] : []) as never
        if (path.endsWith('/pulls') && method === 'POST') {
          writes.push({ intent: saved.createIntent, fields })
          created = true
          return pull() as never
        }
        if (path.endsWith('/protection')) return protection as never
        if (path.includes('/check-runs'))
          return {
            total_count: 1,
            check_runs: [
              {
                name: 'verify',
                head_sha: checkHead,
                status: 'completed',
                conclusion: 'success',
                app: { id: 1, slug: 'github-actions' },
              },
            ],
          } as never
        if (path.endsWith('/merge')) {
          writes.push({ intent: saved.mergeIntent, fields })
          done = true
          return { merged: true, sha: merged } as never
        }
        return pull(done) as never
      }
      const save = async (d: Delivery) => {
        saved = structuredClone(d)
      }
      const signal = new AbortController().signal
      const steps: string[] = []
      const advance = async () => {
        await advanceDelivery('/project', structuredClone(saved), save, signal, api)
        steps.push(`${saved.stage}:${writes.length}`)
      }
      if (risk === 'high') {
        await advance()
        saved.publishApproved = saved.mergeApproved = true
      }
      await advance()
      await advance()
      await advance()
      if (risk === 'high') {
        checkHead = candidate
        await advance()
      }
      if (risk === 'medium') {
        await advance()
        saved.mergeApproved = true
      }
      await advance()
      await advance()
      expect(steps).toEqual(
        {
          low: ['pr:0', 'ci:1', 'merge:1', 'merge:2', 'merged:2'],
          medium: ['pr:0', 'ci:1', 'merge:1', 'merge:1', 'merge:2', 'merged:2'],
          high: ['publish:0', 'pr:0', 'ci:1', 'ci:1', 'merge:1', 'merge:2', 'merged:2'],
        }[risk],
      )
      expect(saved).toMatchObject({ stage: 'merged', candidate, merged, pr: 3 })
      expect(writes).toEqual([
        {
          intent: true,
          fields: expect.objectContaining({
            title: copy.title,
            body: expect.stringContaining(copy.body),
          }),
        },
        { intent: true, fields: { sha: candidate, merge_method: 'merge' } },
      ])
      expect(writes[0].fields?.body).toContain(tree)
      expect(writes[0].fields?.body).not.toContain(saved.review)
      const pushes = vi.mocked(git).mock.calls.filter((args) => args.includes('push'))
      expect(pushes).toHaveLength(1)
      expect(pushes[0].slice(-2)).toEqual([
        'origin',
        `${candidate}:refs/heads/ultimate-delivery/test`,
      ])
      expect(vi.mocked(git).mock.calls).toContainEqual([
        '/project',
        'remote',
        'get-url',
        '--push',
        '--all',
        'origin',
      ])
    },
  )

  it('does not consume standing approval by reading a matching ref', async () => {
    const waiting: Delivery = { ...makeDelivery(), risk: 'high', publishApproved: true }
    let saved = structuredClone(waiting)
    let branchExists = true
    const writes: string[] = []
    const api: Github = async (path, method) => {
      if (method) writes.push(method)
      if (path === baseRef) return refs('main', baseline) as never
      return (path === deliveryRef && branchExists ? refs(saved.branch, candidate) : []) as never
    }
    vi.mocked(git).mockClear().mockResolvedValue('git@github.com:example/my-app.git')
    const save = async (d: Delivery) => {
      if (d.createIntent) {
        delete saved.publishApproved
        throw new Error('Publish approval was withdrawn; approve again to publish')
      }
      saved = { ...d, publishApproved: saved.publishApproved }
    }
    const signal = new AbortController().signal
    await advanceDelivery('/project', saved, save, signal, api)
    expect(saved).toMatchObject({ stage: 'pr', published: true })
    expect(saved.publishIntent).toBeUndefined()
    await advanceDelivery('/project', saved, save, signal, api)
    expect(saved).toMatchObject({ stage: 'blocked', resumeStage: 'pr' })
    expect(saved.createIntent).toBeUndefined()
    saved.stage = 'pr'
    await advanceDelivery('/project', saved, save, signal, api)
    branchExists = false
    await advanceDelivery('/project', { ...waiting, publishApproved: undefined }, save, signal, api)
    expect(writes).toEqual([])
    expect(vi.mocked(git).mock.calls.some((args) => args.includes('push'))).toBe(false)
  })

  it('refuses publication to a remote with more than one push destination', async () => {
    vi.mocked(git)
      .mockReset()
      .mockResolvedValue(
        'https://github.com/example/my-app.git\nhttps://github.com/example/other.git',
      )
    const api = vi.fn<() => Promise<never>>(async () => {
      throw new Error('No GitHub call is expected')
    })
    const result = await advanceDelivery(
      '/project',
      makeDelivery(),
      async () => undefined,
      new AbortController().signal,
      api,
    )
    expect(result).toMatchObject({ stage: 'blocked', cause: 'safety' })
    expect(result.publishIntent).toBeUndefined()
    expect(api).not.toHaveBeenCalled()
    expect(vi.mocked(git).mock.calls).toHaveLength(1)
  })

  it('writes to no workflow run when the protection names a check outside the configuration', async () => {
    const saved: Delivery = { ...makeDelivery(), stage: 'ci', pr: 3 }
    const writes: string[] = []
    const api: Github = async (path, method) => {
      if (method === 'POST') {
        writes.push(path)
        return {} as never
      }
      if (path.endsWith('/protection'))
        return {
          ...protection,
          required_status_checks: { strict: true, checks: [{ context: 'another-job', app_id: 1 }] },
        } as never
      if (path.includes('/check-runs'))
        return {
          total_count: 1,
          check_runs: [
            {
              name: 'another-job',
              head_sha: candidate,
              status: 'completed',
              conclusion: 'timed_out',
              completed_at: new Date().toISOString(),
              details_url: 'https://github.com/example/my-app/actions/runs/17',
              app: { id: 1, slug: 'github-actions' },
            },
          ],
        } as never
      return pull() as never
    }
    const result = await advanceDelivery(
      '/project',
      saved,
      async () => undefined,
      new AbortController().signal,
      api,
    )
    expect(result).toMatchObject({ stage: 'blocked', cause: 'safety' })
    expect(writes).toEqual([])
  })

  it('reads an empty success body as a successful write', async () => {
    vi.mocked(exec).mockResolvedValueOnce({
      stdout: 'HTTP/2.0 204 No Content\r\nx-github-request-id: 1\r\n\r\n',
      stderr: '',
    })
    await expect(
      github('/project', new AbortController().signal)(
        'repos/example/my-app/actions/runs/1/rerun',
        'POST',
      ),
    ).resolves.toEqual({})
  })

  it('reconciles a PR created before interruption using persisted state in a replacement task', async () => {
    let saved = { ...makeDelivery(), stage: 'pr' as const }
    let exists = false
    const controller = new AbortController()
    let intentAtWrite: boolean | undefined
    let creates = 0
    const api: Github = async (path, method) => {
      if (path.includes('/pulls?')) return (exists ? [pull()] : []) as never
      if (method === 'POST') {
        creates++
        intentAtWrite = saved.createIntent
        exists = true
        controller.abort(new Error('interrupted'))
        throw new Error('lost response')
      }
      throw new Error('Unexpected request')
    }
    const save = async (d: Delivery) => {
      saved = structuredClone(d) as typeof saved
    }
    await expect(advanceDelivery('/project', saved, save, controller.signal, api)).rejects.toThrow(
      'interrupted',
    )
    expect(saved).toMatchObject({ stage: 'pr', createIntent: true })
    expect(intentAtWrite).toBe(true)
    await advanceDelivery(
      '/project',
      structuredClone(saved),
      save,
      new AbortController().signal,
      api,
    )
    expect(saved).toMatchObject({ stage: 'ci', pr: 3, candidate })
    expect(creates).toBe(1)
  })
})
