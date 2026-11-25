import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { git } from '../../../lib/git.ts'
import { advanceDelivery, closePull, deliveryRuntime, GithubRequestError } from '../advance.ts'
import type { Github } from '../advance.ts'
import {
  authorize,
  inFlight,
  MAX_REBUILDS,
  needsSlot,
  needsUser,
  park,
  pick,
  POLL_MS,
  supersedes,
  waits,
} from '../delivery.ts'
import type { Delivery } from '../delivery.ts'
import type { QueueEntry, StandingGrant } from '../types.ts'

vi.mock('../../../lib/git.ts', () => ({ git: vi.fn<typeof git>() }))

const shaFor = (key: string) => createHash('sha1').update(key).digest('hex')
const MIN = 60_000
const END = 150
const repository = 'example/my-app'
const settings = {
  repository,
  remote: 'origin',
  base: 'main',
  checks: [],
  requiredChecks: ['verify'],
}
const protection = {
  enforce_admins: { enabled: true },
  required_pull_request_reviews: { required_approving_review_count: 0 },
  required_status_checks: { strict: true, checks: [{ context: 'verify', app_id: 1 }] },
}
type Entry = Pick<QueueEntry, 'conversationId' | 'target' | 'state' | 'delivery' | 'rebuilds'> & {
  id: string
  deliveryConfig: typeof settings
  result?: { status: 'failed'; reason: string }
  deadline?: number
}
const entry = (id: string): Entry => ({
  id,
  conversationId: (id[0].charCodeAt(0) - 64) as Entry['conversationId'],
  target: 'main',
  state: 'queued',
  deliveryConfig: settings,
})
type Check = { atMinute: number; name: string; status: string; conclusion: string | null }
const check = (atMinute: number, conclusion: string | null, status = 'completed'): Check => ({
  atMinute,
  name: 'verify',
  status,
  conclusion,
})
type Scenario = {
  name: string
  ids: string
  checks?: (Check | null)[]
  external?: boolean
  stale?: boolean
  unstarted?: boolean
  resubmit?: boolean
  approval?: boolean
}
const success = check(2, 'success')
const timeout = check(2, 'timed_out')
const failure = check(1, 'failure')
const fix: Scenario = {
  name: '1. CI fix behind blocked head (2026-11-09)',
  ids: 'ABC',
  checks: [failure],
}
const missing: Scenario = {
  name: '2. Runner never acquired',
  ids: 'A',
  checks: [check(0, null, 'queued'), check(10, 'success')],
}
const slow: Scenario[] = [
  { name: '3a. One runner timeout', ids: 'A', checks: [timeout, success] },
  { name: '3b. Two runner timeouts', ids: 'A', checks: [timeout, timeout, success] },
  { name: '3c. Three runner timeouts', ids: 'AC', checks: [timeout, timeout, timeout] },
]
const external: Scenario = { name: '4. Externally merged PR', ids: 'AB', external: true }
const stale: Scenario = { name: '5. Base moved', ids: 'AB', stale: true }
const green: Scenario = { name: '6. Two green low-risk PRs', ids: 'AB', unstarted: true }
const repair: Scenario = { ...fix, name: '7. PR #33 (2026-11-20)', ids: 'AC', resubmit: true }
const medium: Scenario = { name: '8. Medium approval waits 120 min', ids: 'ABCD', approval: true }
const scenarios = [fix, missing, ...slow, external, stale, green, repair, medium]

function ready(queue: Entry[], e: Entry, now: number) {
  const d = e.delivery
  if (d && waits(d)) return false
  if (d?.slot) return (d.pollAt ?? 0) <= now
  const repo = d?.settings.repository ?? e.deliveryConfig.repository
  return !queue.some(
    ({ delivery: other }) =>
      other?.settings.repository === repo && other.slot === true && !waits(other),
  )
}

async function replay(s: Scenario, mode: 'OLD' | 'NEW', mergeIntent = false) {
  const entries = Array.from(s.ids, entry)
  const queue = [...entries]
  const merged = new Map<string, number>()
  const pushes = new Map<string, { sha: string; minute: number }>()
  const closing: { pr: number; reason: string }[] = []
  const calls: { path: string; method: string; minute: number; body?: string }[] = []
  const actions: { kind: string; minute: number; before: number }[] = []
  const approvals: string[] = []
  const runs = new Map<string, Check[][]>()
  let minute = 0
  let main = shaFor('initial-main')
  let slotHold = 0,
    stuck = 0,
    clicks = 0,
    parkedHold = 0
  const signal = new AbortController().signal
  const grant: StandingGrant = {
    instruction: 1 as StandingGrant['instruction'],
    conversation: entries[0].conversationId,
    at: 120 * MIN,
    until: END * MIN,
  }
  const build = (e: Entry, stage: Delivery['stage'] = 'publish'): Delivery => {
    const suffix = e.rebuilds ? `-r${e.rebuilds}` : ''
    return {
      settings,
      stage,
      risk: s.approval && e.id === 'A' ? 'medium' : 'low',
      baseline: main,
      candidate: shaFor(`${e.id}-sha${suffix}`),
      tree: shaFor(`${e.id}-tree${suffix}`),
      branch: `ultimate-delivery/${e.id}${suffix}`,
      review: 'Independent review of the fixture tree',
      checkedAt: minute * MIN,
      runtime: deliveryRuntime(),
    }
  }
  const create = (d: Delivery, number: number) => {
    const repo = { full_name: repository }
    return {
      number,
      html_url: `https://github.com/${repository}/pull/${number}`,
      state: 'open',
      merged: false,
      merge_commit_sha: null as string | null,
      head: { sha: d.candidate, ref: d.branch, repo },
      base: { sha: d.baseline, ref: 'main', repo },
    }
  }
  const pulls: ReturnType<typeof create>[] = []
  const finish = (p: ReturnType<typeof create>) => {
    p.merged = true
    p.state = 'closed'
    main = p.merge_commit_sha = shaFor(`merge-${p.head.sha}`)
  }
  const startRun = (sha: string) => {
    const history = runs.get(sha) ?? []
    const scripted = sha === shaFor('A-sha') && s.checks ? s.checks[history.length] : success
    if (scripted === undefined) throw new Error(`Unexpected CI run for ${sha}`)
    history.push(scripted ? [{ ...scripted, atMinute: minute + scripted.atMinute }] : [])
    runs.set(sha, history)
  }
  const publishPR = (d: Delivery) => {
    const p = create(d, pulls.length + 1)
    pulls.push(p)
    startRun(d.candidate)
    return p
  }
  if (!s.unstarted) {
    const d = build(entries[0], s.approval ? 'merge' : 'ci')
    const p = publishPR(d)
    entries[0].delivery = { ...d, pr: p.number, since: 0, published: true, slot: true }
    if (s.stale) entries[0].delivery.pollAt = MIN
    if (s.approval || s.external) runs.get(d.candidate)![0] = [check(0, 'success')]
    if (s.external) finish(p)
  }
  if (s.stale) entries[1].delivery = build(entries[1])
  vi.mocked(git).mockImplementation(async (_source, command, ...args) => {
    if (command === 'remote' && args[0] === 'get-url') return `https://github.com/${repository}.git`
    if (command === 'push') {
      assert.equal(args.at(-2), 'origin')
      const [sha, ref] = args.at(-1)!.split(':')
      pushes.set(ref, { sha, minute })
      return ''
    }
    if (s.external && command === '--no-replace-objects') {
      const first = pulls[0]
      if (args[0] === 'show' && args.at(-1) === first.merge_commit_sha)
        return `${first.base.sha} ${first.head.sha}`
      if (args[0] === 'rev-parse') return entries[0].delivery!.tree
      if (args[0] === 'cat-file' || args[0] === 'merge-base') return ''
    }
    throw new Error(`Unexpected git command: ${command} ${args.join(' ')}`)
  })
  const api: Github = async (path, method = 'GET', fields = {}) => {
    calls.push({ path, method, minute, body: fields.body })
    const p = pulls[Number(/\/(?:pulls|issues)\/(\d+)/.exec(path)?.[1]) - 1]
    if (path.endsWith('/git/ref/heads/main'))
      return { ref: 'refs/heads/main', object: { type: 'commit', sha: main } } as never
    const query = new URLSearchParams(path.split('?')[1])
    const branch = path.split('/git/matching-refs/heads/')[1]
    if (branch) {
      const ref = `refs/heads/${branch}`
      // OLD pushed after the wait with no new check of its verified base.
      const old = mode === 'OLD' && queue[0]?.delivery?.stage === 'publish'
      const sha =
        branch === 'main' ? (old ? queue[0].delivery!.baseline : main) : pushes.get(ref)?.sha
      return (sha ? [{ ref, object: { type: 'commit', sha } }] : []) as never
    }
    if (path.includes('/compare/')) {
      const [from, to] = path.split('/compare/')[1].split('?')[0].split('...')
      assert.equal(to, main)
      return { status: 'ahead', merge_base_commit: { sha: from } } as never
    }
    if (path.includes('/pulls?'))
      return pulls.filter((pull) => query.get('head') === `example:${pull.head.ref}`) as never
    if (path.endsWith('/pulls') && method === 'POST') {
      const d = queue.find((e) => e.delivery?.branch === fields.head)!.delivery!
      if (pushes.get(`refs/heads/${fields.head}`)?.sha !== d.candidate)
        throw new Error('PR head not pushed')
      return publishPR(d) as never
    }
    if (p && path.includes('/comments')) return (method === 'POST' ? {} : []) as never
    if (p && method === 'PATCH' && fields.state === 'closed') {
      p.state = 'closed'
      return p as never
    }
    if (p && method === 'PUT' && path.endsWith('/merge')) {
      if (main !== p.base.sha) throw new GithubRequestError(405)
      if (fields.sha !== p.head.sha || p.state !== 'open') throw new GithubRequestError(409)
      finish(p)
      return { merged: true, sha: main } as never
    }
    if (p && path.endsWith(`/pulls/${p.number}`)) return p as never
    if (path.endsWith('/protection')) return protection as never
    const sha = /\/commits\/([^/]+)\/check-runs/.exec(path)?.[1] ?? query.get('head_sha')
    const timeline = sha ? runs.get(sha)?.at(-1) : undefined
    const latest = timeline?.findLast((c) => c.atMinute <= minute)
    if (path.includes('/check-runs')) {
      if (!latest) return { total_count: 0, check_runs: [] } as never
      const completed_at = new Date(latest.atMinute * MIN).toISOString()
      const app = { id: 1, slug: 'github-actions' }
      const run = {
        ...latest,
        head_sha: sha,
        completed_at,
        app,
        details_url: `https://github.com/${repository}/actions/runs/${pulls.find((pull) => pull.head.sha === sha)!.number}`,
      }
      return { total_count: 1, check_runs: [run] } as never
    }
    if (path.includes('/actions/runs?')) {
      const id = pulls.find((pull) => pull.head.sha === sha)!.number
      return {
        workflow_runs:
          mode === 'OLD' ? [] : [{ id, status: latest?.status ?? 'queued', head_sha: sha }],
      } as never
    }
    const own = /\/actions\/runs\/(\d+)$/.exec(path)
    if (own && method === 'GET') {
      const candidate = pulls[Number(own[1]) - 1].head.sha
      const status = runs
        .get(candidate)
        ?.at(-1)
        ?.findLast((c) => c.atMinute <= minute)?.status
      return { id: Number(own[1]), status: status ?? 'queued', head_sha: candidate } as never
    }
    const action = /\/actions\/runs\/(\d+)\/(rerun|cancel)$/.exec(path)
    if (action && method === 'POST' && mode === 'NEW') {
      const candidate = pulls[Number(action[1]) - 1].head.sha
      const d = queue.find((e) => e.delivery?.candidate === candidate)!.delivery!
      const kind = action[2]
      actions.push({ kind, minute, before: d.reruns ?? 0 })
      const run = runs.get(candidate)!.at(-1)!
      if (kind === 'cancel') run.push(check(minute + 0.5, 'cancelled'))
      else startRun(candidate)
      return {} as never
    }
    throw new Error(`Unexpected GitHub request: ${method} ${path}`)
  }

  const retire = (e: Entry, reason: string) => {
    queue.splice(queue.indexOf(e), 1)
    e.result = { status: 'failed', reason }
    if (e.delivery?.pr) closing.push({ pr: e.delivery.pr, reason })
  }
  const step = async (e: Entry) => {
    const before = e.delivery
    if (!before) {
      // Local verification occupies this tick; publication can start next minute.
      e.delivery = build(e)
      return true
    }
    if (mode === 'OLD' && s.external && e.id === 'A') {
      e.delivery = { ...before, stage: 'blocked', cause: 'safety' }
      return true
    }
    const d = await advanceDelivery(
      '/fixture',
      { ...before, slot: true },
      async (saved) => {
        e.delivery = saved
      },
      signal,
      api,
      minute * MIN,
    )
    e.delivery = { ...d, pollAt: minute * MIN + POLL_MS }
    if (waits(e.delivery)) delete e.delivery.slot
    if (d.stage === 'merged') {
      merged.set(e.id, minute)
      queue.splice(queue.indexOf(e), 1)
    } else if (d.stage === 'blocked' && d.cause === 'stale' && mode === 'OLD') {
      // The base lander had no rebuild: the user stops the stale PR and the branch resubmits a new tip.
      clicks++
      retire(e, 'Stopped')
      const fresh = { ...entry(e.id), id: `${e.id}'`, rebuilds: (e.rebuilds ?? 0) + 1 }
      queue.push(fresh)
      entries.push(fresh)
    } else if (d.stage === 'blocked') {
      if (d.cause === 'stale' && (e.rebuilds ?? 0) < MAX_REBUILDS) {
        e.rebuilds = (e.rebuilds ?? 0) + 1
        if (d.pr) await closePull(api, repository, d.pr, `Superseded: ${d.reason}`)
        delete e.delivery
      } else {
        const why = d.cause === 'stale' ? 'Rebuild limit reached' : needsUser(d)
        e.delivery.wake = why ? { block: 1, to: 'user', why } : { block: 1, to: 'branch' }
      }
    }
    return (
      d.stage !== before.stage ||
      d.rerunAt !== before.rerunAt ||
      d.mergeIntent !== before.mergeIntent
    )
  }

  for (minute = 0; minute < END; minute++) {
    if (s.resubmit && minute === 5) {
      const a2 = entry('A2')
      if (mode === 'NEW') {
        if (mergeIntent) entries[0].delivery!.mergeIntent = true
        assert.equal(supersedes(entries[0], a2), !mergeIntent)
        for (const old of queue.filter((e) => supersedes(e, a2))) retire(old, 'Superseded')
      }
      queue.push(a2)
      entries.push(a2)
    }
    if (s.approval && minute >= 120) {
      const d = queue[0]?.delivery
      if (d && waits(d)?.on === 'merge') {
        const env = { now: minute * MIN, runtime: deliveryRuntime() }
        assert.equal(
          authorize({ by: 'ultimate', standing: grant }, 'merge', d, 'waiting', env),
          undefined,
        )
        d.mergeApproved = true
        approvals.push(d.candidate)
      }
    }
    for (const { pr, reason } of closing.splice(0)) await closePull(api, repository, pr, reason)
    const now = minute * MIN
    const head = queue[0]
    const parked = head?.delivery && waits(head.delivery)
    if (mode === 'OLD') {
      // ponytail: approximate the old slot rule, using the same PR transitions but no Actions retries,
      // and the base lander's one-hour expiry of every wait (11455df7 lander.ts:693-714): an expired wait
      // blocks until the user clicks Recheck.
      if (!head) continue
      const d = head.delivery
      if (
        d &&
        d.stage !== 'blocked' &&
        d.stage !== 'merged' &&
        now > (head.deadline ?? d.checkedAt + 60 * MIN)
      ) {
        d.resumeStage = d.stage
        d.stage = 'blocked'
        d.reason = 'Delivery waited over one hour; recheck explicitly'
      }
      if (d?.stage === 'blocked' && d.reason?.startsWith('Delivery waited over one hour')) {
        clicks++
        d.stage = d.resumeStage!
        head.deadline = now + 60 * MIN
        delete d.reason
        slotHold++
        continue
      }
      if (parked) {
        stuck = Math.max(stuck, queue.slice(1).filter((e) => ready(queue, e, now)).length)
        if (s.checks?.[0] === failure && minute === 15) {
          retire(head, 'Stopped')
          clicks++
          continue
        }
        parkedHold++
        slotHold++
      } else if ((head.delivery?.pollAt ?? 0) > now || !(await step(head))) slotHold++
      continue
    }
    for (const e of queue) {
      e.state = e.delivery && waits(e.delivery) ? 'waiting' : 'queued'
      if (e.state === 'waiting') delete e.delivery!.slot
    }
    const choice = pick(queue, now)
    const index = choice && 'ready' in choice ? choice.ready : undefined
    const first = queue.findIndex((e) => ready(queue, e, now))
    assert.equal(
      index,
      first < 0 ? undefined : first,
      `${s.name}, minute ${minute}: first eligible entry`,
    )
    const chosen = index === undefined ? undefined : queue[index]
    if (chosen?.delivery) assert.equal(waits(chosen.delivery), undefined)
    if (s.stale && !merged.has('A')) assert.equal(entries[1].delivery?.stage, 'publish')
    if (parked && !chosen)
      stuck = Math.max(stuck, queue.slice(1).filter((e) => ready(queue, e, now)).length)
    const progressed = chosen ? await step(chosen) : false
    if (head?.delivery && !parked && (!chosen || (chosen === head && !progressed))) slotHold++
  }
  const wasted = pulls
    .filter((p) => !p.merged)
    .reduce((sum, p) => sum + runs.get(p.head.sha)!.length, 0)
  return {
    entries,
    merged,
    pulls,
    calls,
    actions,
    pushes,
    approvals,
    slotHold,
    stuck,
    clicks,
    parkedHold,
    wasted,
    apiCalls: calls.length,
  }
}

const blocked = (cause: string, to: string) => ({ stage: 'blocked', cause, wake: { to } })
const comment = (pr: number, body: string) =>
  expect.objectContaining({
    method: 'POST',
    path: `repos/${repository}/issues/${pr}/comments`,
    body: expect.stringContaining(body),
  })

it('lets the CI fix bypass the blocked head', async () => {
  const r = await replay(fix, 'NEW')
  expect(r.entries[0].delivery).toMatchObject(blocked('check-failed', 'branch'))
  expect(r.pulls[0].state).toBe('open')
  expect([...r.merged.keys()]).toEqual(['B', 'C'])
})

it('cancels then retries a run that never acquired a runner', async () => {
  const r = await replay(missing, 'NEW')
  expect(r.actions).toEqual([
    { kind: 'cancel', minute: 61, before: 0 },
    { kind: 'rerun', minute: 62, before: 1 },
  ])
  expect(r.entries[0].delivery?.reruns).toBe(1)
  expect(r.merged.get('A')).toBeGreaterThan(72)
})

it.each(slow)('$name', async (s) => {
  const r = await replay(s, 'NEW')
  const exhausted = s.checks!.at(-1) === timeout
  const reruns = exhausted ? 2 : s.checks!.length - 1
  expect(r.actions.map(({ kind }) => kind)).toEqual(Array<string>(reruns).fill('rerun'))
  expect(r.entries[0].delivery).toMatchObject({
    ...(exhausted ? blocked('infra', 'branch') : { stage: 'merged' }),
    reruns,
  })
  expect([...r.merged.keys()]).toEqual(exhausted ? ['C'] : ['A'])
  expect(r.wasted).toBe(exhausted ? 3 : 0)
})

it('records an externally merged PR and continues without writing to it', async () => {
  const r = await replay(external, 'NEW')
  expect(r.entries[0].delivery).toMatchObject({
    stage: 'merged',
    observedMerge: expect.any(Object),
  })
  expect(r.entries[0].delivery?.mergeIntent).toBeUndefined()
  expect([...r.merged.keys()]).toEqual(['A', 'B'])
  expect(
    r.calls.filter(({ path, method }) => path.includes('/pulls/1') && method !== 'GET'),
  ).toEqual([])
})

it.each([stale, green])('$name: B publishes after A merges', async (s) => {
  const r = await replay(s, 'NEW')
  expect([...r.merged.keys()]).toEqual(['A', 'B'])
  const branch = r.entries[1].delivery!.branch
  expect(r.pushes.get(`refs/heads/${branch}`)!.minute).toBeGreaterThan(r.merged.get('A')!)
})

it(`${stale.name}: rebuilds before spending a push or a CI run on the obsolete SHA`, async () => {
  const r = await replay(stale, 'NEW')
  expect(r.entries[1]).toMatchObject({
    rebuilds: 1,
    delivery: { branch: 'ultimate-delivery/B-r1' },
  })
  expect(r.pushes.has('refs/heads/ultimate-delivery/B')).toBe(false)
  expect(r.pulls.map((p) => p.head.sha)).toEqual([shaFor('A-sha'), shaFor('B-sha-r1')])
  expect(r.wasted).toBe(0)
})

it('supersedes the parked PR #33 submission unless a merge is uncertain', async () => {
  const r = await replay(repair, 'NEW')
  expect(r.entries[0]).toMatchObject({
    delivery: blocked('check-failed', 'branch'),
    result: { status: 'failed', reason: 'Superseded' },
  })
  expect([...r.merged.keys()]).toEqual(['C', 'A2'])
  expect(r.pulls[0].state).toBe('closed')
  expect(r.calls).toContainEqual(comment(1, 'Superseded'))
  const uncertain = await replay(repair, 'NEW', true)
  expect(uncertain.entries[0].delivery).toMatchObject({ stage: 'blocked', mergeIntent: true })
  expect(uncertain.entries[0].result).toBeUndefined()
  expect(uncertain.pulls[0].state).toBe('open')
})

it('lets three low PRs merge during the two-hour approval wait', async () => {
  const r = await replay(medium, 'NEW')
  expect([...r.merged.keys()]).toEqual(['B', 'C', 'D', 'A'])
  expect(r.merged.get('D')).toBeLessThan(120)
  expect(r.entries[0].rebuilds).toBe(1)
  expect(r.approvals).toEqual([shaFor('A-sha'), shaFor('A-sha-r1')])
  expect(await replay(medium, 'OLD')).toMatchObject({ stuck: 3 })
  expect((await replay(medium, 'OLD')).clicks).toBeGreaterThan(0)
})

it('keeps one PR in flight per repository when a parked approval resumes', () => {
  const a: Delivery = {
    settings,
    stage: 'merge',
    risk: 'medium',
    baseline: 'm',
    candidate: 'A-sha',
    tree: 'A-tree',
    branch: 'ultimate-delivery/A',
    review: 'r',
    checkedAt: 0,
    runtime: deliveryRuntime(),
    pr: 1,
  }
  const b: Delivery = { ...a, stage: 'ci', risk: 'low', candidate: 'B-sha', pr: 2, slot: true }
  const queue = [{ delivery: a }, { delivery: b }]
  expect(pick(queue, 0)).toEqual({ ready: 1 })
  a.mergeApproved = true
  expect(pick(queue, 0)).toEqual({ ready: 1 })
  b.pollAt = 60_000
  expect(pick(queue, 0)).toEqual({ until: 60_000 })
  delete b.slot
  expect(pick(queue, 0)).toEqual({ ready: 0 })
  // Parking releases the slot in the same write, so an approval between two scheduler turns cannot revive it.
  const parked = {
    state: 'landing' as const,
    delivery: { ...b, stage: 'merge' as const, risk: 'medium' as const, slot: true },
  }
  park(parked)
  expect(parked).toMatchObject({ state: 'waiting' })
  expect(parked.delivery.slot).toBeUndefined()
  parked.delivery.mergeApproved = true
  expect(inFlight(parked.delivery)).toBe(false)
  // A source whose only entry waits for another source's slot stays scheduled, not terminated.
  expect(
    needsSlot(
      [
        { delivery: { ...a, stage: 'publish' as const, risk: 'low' as const } },
        { delivery: { ...b, slot: true } },
      ],
      { delivery: { ...a, stage: 'publish' as const, risk: 'low' as const } },
    ),
  ).toBe(true)
})

it('prints the old-vs-new table', async () => {
  const rows = [
    [
      'scenario',
      'mode',
      'slot-hold min',
      'stuck behind',
      'user clicks',
      'CI runs wasted',
      'minutes to merge (per entry)',
    ],
  ]
  for (const s of scenarios) {
    const old = await replay(s, 'OLD')
    const next = await replay(s, 'NEW')
    expect(next.slotHold).toBeLessThanOrEqual(old.slotHold)
    expect(next.stuck).toBeLessThanOrEqual(old.stuck)
    expect(next.clicks).toBeLessThanOrEqual(old.clicks)
    expect(next.clicks).toBe(0)
    if ([fix, repair, medium].includes(s)) assert.ok(next.stuck < old.stuck, s.name)
    for (const [mode, r] of [
      ['OLD', old],
      ['NEW', next],
    ] as const) {
      const times = r.entries.map(({ id }) => `${id}: ${r.merged.get(id) ?? '-'}`).join(', ')
      rows.push([s.name, mode, `${r.slotHold}`, `${r.stuck}`, `${r.clicks}`, `${r.wasted}`, times])
    }
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)))
  const numeric = (i: number) => i >= 2 && i <= 5
  rows.splice(
    1,
    0,
    widths.map((w, i) => (numeric(i) ? '-'.repeat(w - 1) + ':' : '-'.repeat(w))),
  )
  const table = rows.map(
    (row) =>
      `| ${row.map((v, i) => (numeric(i) ? v.padStart(widths[i]) : v.padEnd(widths[i]))).join(' | ')} |`,
  )
  table.push(
    '',
    'Times show when the lander confirmed each merge, in simulated minutes from the start. A dash means no merge was confirmed before minute 150. Slot-hold time counts minutes when the head kept the slot without progress.',
    '',
    'In 3c, NEW spends three CI runs on A. OLD spends one. Both automatic retries time out.',
    '',
  )
  writeFileSync(new URL('./queue-replay.md', import.meta.url), table.join('\n'))
  expect(rows.filter((row) => row[1] === 'OLD')).toHaveLength(scenarios.length)
})
