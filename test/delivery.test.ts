import { describe, expect, it, vi } from 'vitest'
import {
  advanceDelivery,
  deliveryRuntime,
  GithubRequestError,
} from '../extensions/workspaces/delivery.ts'
import type { Delivery, Github } from '../extensions/workspaces/delivery.ts'
import { git } from '../lib/git.ts'

vi.mock('../lib/git.ts', () => ({ git: vi.fn<typeof git>() }))
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
const protection = {
  enforce_admins: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
  required_pull_request_reviews: { required_approving_review_count: 0 },
  required_status_checks: { strict: true, checks: [{ context: 'verify', app_id: 1 }] },
}

describe('PR delivery', () => {
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
      vi.mocked(git).mockImplementation(async (...args) =>
        args.includes('rev-parse') ? baseline : '',
      )
      const api: Github = async (path, method) => {
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
      expect(saved.stage).toBe('blocked')
      expect(saved.createIntent).toBeUndefined()
      expect(saved.mergeIntent).toBeUndefined()
      saved.stage = saved.resumeStage!
      await advanceDelivery('/project', saved, save, signal, api)
      if (operation === 'merge') await advanceDelivery('/project', saved, save, signal, api)
      expect(saved.stage).toBe(operation === 'create' ? 'ci' : 'merged')
      expect(writes).toBe(2)
    },
  )

  it.each(['publish', 'merge'] as const)(
    'reconciles an interrupted %s without repeating its external write',
    async (stage) => {
      let saved: Delivery = { ...makeDelivery(), stage, ...(stage === 'merge' ? { pr: 3 } : {}) }
      let happened = false
      let writes = 0
      const controller = new AbortController()
      vi.mocked(git).mockImplementation(async (...args) => {
        if (args.includes('get-url')) return 'git@github.com:example/my-app.git'
        if (args.includes('ls-remote'))
          return happened ? `${candidate}\trefs/heads/ultimate-delivery/test` : ''
        if (args.includes('rev-parse')) return baseline
        if (args.includes('push')) {
          writes++
          happened = true
          controller.abort(new Error('interrupted'))
          throw new Error('lost push response')
        }
        return ''
      })
      const api: Github = async (path, method) => {
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
      }
      await expect(
        advanceDelivery('/project', saved, save, controller.signal, api),
      ).rejects.toThrow('interrupted')
      await advanceDelivery(
        '/project',
        structuredClone(saved),
        save,
        new AbortController().signal,
        api,
      )
      expect(writes).toBe(1)
      expect(saved.stage).toBe(stage === 'publish' ? 'pr' : 'merged')
    },
  )

  it('checks the exact candidate and merges through its PR without pushing the target', async () => {
    vi.mocked(git).mockClear()
    let saved = makeDelivery()
    let created = false
    let done = false
    const writes: { intent: boolean | undefined; fields?: Record<string, string> }[] = []
    vi.mocked(git).mockImplementation(async (...args) => {
      if (args.includes('get-url')) return 'git@github.com:example/my-app.git'
      if (args.includes('rev-parse')) return baseline
      return ''
    })
    const api: Github = async (path, method, fields) => {
      if (path.includes('/pulls?')) return (created ? [pull()] : []) as never
      if (path.endsWith('/pulls') && method === 'POST') {
        writes.push({ intent: saved.createIntent })
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
              head_sha: candidate,
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
    for (let transition = 0; transition < 6; transition++)
      await advanceDelivery('/project', saved, save, signal, api)
    expect(saved).toMatchObject({ stage: 'merged', candidate, merged, pr: 3 })
    expect(writes).toEqual([
      { intent: true },
      { intent: true, fields: { sha: candidate, merge_method: 'merge' } },
    ])
    const pushes = vi.mocked(git).mock.calls.filter((args) => args.includes('push'))
    expect(pushes).toHaveLength(1)
    expect(pushes[0]).toContain(`${candidate}:refs/heads/ultimate-delivery/test`)
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
