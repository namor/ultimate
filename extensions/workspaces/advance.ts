import { exec } from '../../lib/exec.ts'
import { git } from '../../lib/git.ts'
import { CI_LIMIT_MS, MAX_RERUNS, waits } from './delivery.ts'
import type { Cause, Delivery, Stage } from './delivery.ts'
import { pullRequestText } from './pull-request.ts'

export const deliveryRuntime = () => `${process.version}/${process.platform}/${process.arch}`

type Pull = {
  number: number
  html_url: string
  state: string
  merged: boolean
  merge_commit_sha: string | null
  head: { sha: string; ref: string; repo: { full_name: string } | null }
  base: { ref: string; sha: string; repo: { full_name: string } }
}
type Check = {
  name: string
  head_sha: string
  status: string
  conclusion: string | null
  completed_at: string | null
  details_url?: string | null
  app: { id: number; slug: string }
}
type Protection = {
  enforce_admins: { enabled: boolean }
  allow_force_pushes: { enabled: boolean }
  allow_deletions: { enabled: boolean }
  required_status_checks: { strict: boolean; checks: { context: string; app_id: number | null }[] }
  required_pull_request_reviews?: { required_approving_review_count: number }
}
export type Github = <T>(
  path: string,
  method?: string,
  fields?: Record<string, string>,
) => Promise<T>
export class GithubRequestError extends Error {
  readonly status?: number
  readonly definitive: boolean
  constructor(status?: number) {
    super(status ? `GitHub request rejected (HTTP ${status})` : 'GitHub request outcome is unknown')
    this.status = status
    this.definitive = status !== undefined && status >= 400 && status < 500
  }
}
export class Block extends Error {
  readonly cause: Cause
  constructor(cause: Cause, message: string) {
    super(message)
    this.cause = cause
  }
}
const responseStatus = (output: string) => {
  const match = /^HTTP\/[\d.]+\s+(\d{3})\b/.exec(output)
  return match ? Number(match[1]) : undefined
}
export const github =
  (cwd: string, signal: AbortSignal): Github =>
  async <T>(path: string, method = 'GET', fields: Record<string, string> = {}) => {
    const args = ['api', '--hostname', 'github.com', '--include', '--method', method, path]
    for (const [key, value] of Object.entries(fields)) args.push('-f', `${key}=${value}`)
    let output: string
    try {
      const result = await exec('gh', args, { cwd, signal, timeout: 30000, maxBuffer: 1024 * 1024 })
      output = result.stdout
    } catch (error) {
      signal.throwIfAborted()
      throw new GithubRequestError(responseStatus((error as { stdout?: string }).stdout ?? ''))
    }
    const boundary = /\r?\n\r?\n/.exec(output)
    try {
      if (!boundary) throw new Error('Missing HTTP headers')
      const body = output.slice(boundary.index + boundary[0].length).trim()
      return (body ? JSON.parse(body) : {}) as T
    } catch {
      throw new GithubRequestError()
    }
  }

export async function closePull(api: Github, repository: string, pr: number, comment: string) {
  const pull = await api<Pull>(`repos/${repository}/pulls/${pr}`)
  if (pull.merged || pull.state !== 'open') return
  const comments = await api<{ body: string }[]>(
    `repos/${repository}/issues/${pr}/comments?per_page=100&sort=created&direction=desc`,
  )
  if (!comments.some((existing) => existing.body === comment))
    await api(`repos/${repository}/issues/${pr}/comments`, 'POST', { body: comment })
  await api(`repos/${repository}/pulls/${pr}`, 'PATCH', { state: 'closed' })
}

export function assertPull(delivery: Delivery, pull: Pull) {
  const { repository, base } = delivery.settings
  if (
    !Number.isSafeInteger(pull.number) ||
    pull.number < 1 ||
    (delivery.pr !== undefined && pull.number !== delivery.pr) ||
    pull.head?.sha !== delivery.candidate ||
    pull.head.ref !== delivery.branch ||
    pull.head.repo?.full_name !== repository ||
    pull.base?.repo?.full_name !== repository ||
    pull.base.ref !== base
  )
    throw new Block('safety', 'PR identity changed; delivery stopped')
}

export function assertProtection(delivery: Delivery, protection: Protection) {
  const required = protection.required_status_checks
  if (
    !protection.enforce_admins?.enabled ||
    protection.allow_force_pushes?.enabled ||
    protection.allow_deletions?.enabled ||
    !protection.required_pull_request_reviews ||
    !required?.strict ||
    required.checks.length !== delivery.settings.requiredChecks.length ||
    !delivery.settings.requiredChecks.every((name) =>
      required.checks.some((check) => check.context === name),
    )
  )
    throw new Block('safety', 'Strict PR/check protection including administrators is required')
  return required
}

export function checksPassed(delivery: Delivery, protection: Protection, checks: Check[]) {
  const required = assertProtection(delivery, protection)
  return required.checks.every((expected) => {
    const matches = checks.filter(
      (check) => check.name === expected.context && check.head_sha === delivery.candidate,
    )
    return (
      matches.length === 1 &&
      matches[0].status === 'completed' &&
      matches[0].conclusion === 'success' &&
      matches[0].app.slug === 'github-actions' &&
      matches[0].app.id === expected.app_id
    )
  })
}

const fullSha = (sha: unknown): sha is string =>
  typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha)

async function readChecks(api: Github, d: Delivery) {
  const { repository, base } = d.settings
  const protection = await api<Protection>(
    `repos/${repository}/branches/${encodeURIComponent(base)}/protection`,
  )
  const pages = await api<{ check_runs: Check[]; total_count: number }>(
    `repos/${repository}/commits/${d.candidate}/check-runs?filter=latest&per_page=100`,
  )
  if (
    !Array.isArray(pages.check_runs) ||
    pages.total_count !== pages.check_runs.length ||
    pages.total_count > 100
  )
    throw new Block('safety', 'GitHub did not report a complete check list')
  return { protection, checks: pages.check_runs }
}

export async function observePullOutcome(
  source: string,
  delivery: Delivery,
  signal: AbortSignal,
  api = github(source, signal),
  now = Date.now(),
) {
  if (!delivery.pr || !Number.isSafeInteger(delivery.pr) || delivery.pr < 1)
    throw new Block('safety', 'No exact recorded delivery PR to reconcile')
  const pull = await api<Pull>(`repos/${delivery.settings.repository}/pulls/${delivery.pr}`)
  return terminalPull(source, delivery, pull, signal, api, now)
}

async function terminalPull(
  source: string,
  d: Delivery,
  pull: Pull,
  signal: AbortSignal,
  api: Github,
  now: number,
): Promise<Delivery | undefined> {
  assertPull(d, pull)
  if (typeof pull.merged !== 'boolean')
    throw new Block('safety', 'GitHub did not report whether the PR merged')
  if (pull.state === 'open' && !pull.merged) return undefined
  if (pull.state !== 'closed')
    throw new Block('safety', 'GitHub did not report a consistent PR state')
  const result = { ...d, since: now }
  delete result.cause
  delete result.reason
  delete result.resumeStage
  delete result.wake
  const decide = (what: string, why?: string) => {
    result.decisions = [
      ...(d.decisions ?? []).slice(-19),
      { at: now, what, ...(why ? { why } : {}) },
    ]
  }
  if (!pull.merged) {
    if (d.merged || d.mergeReceipt)
      throw new Block('safety', 'GitHub reported an unmerged PR after a recorded merge')
    result.stage = 'closed'
    result.cause = 'closed'
    result.reason = 'Delivery PR was closed without merging'
    decide('PR closed without merge')
    return result
  }
  const sha = pull.merge_commit_sha
  if (!fullSha(sha)) throw new Block('safety', 'GitHub did not report an exact merge commit')
  if ((d.mergeReceipt && d.mergeReceipt !== sha) || (d.merged && d.merged !== sha))
    throw new Block('safety', 'GitHub reported a merge different from the recorded merge')
  result.stage = 'merged'
  result.merged = sha
  if (!d.mergeIntent || d.mergeReceipt !== sha) {
    if (![d.baseline, d.candidate, d.tree].every(fullSha))
      throw new Block(
        'safety',
        'The delivery does not record an exact baseline, candidate and tree',
      )
    const { protection, checks } = await readChecks(api, d)
    if (!checksPassed(d, protection, checks))
      throw new Block('safety', 'Required GitHub checks did not pass on the recorded candidate')
    const { repository, base, remote } = d.settings
    const ref = `refs/heads/${base}`
    const target = await api<{ ref: string; object: { type: string; sha: string } }>(
      `repos/${repository}/git/ref/heads/${base.split('/').map(encodeURIComponent).join('/')}`,
    )
    const targetTip = target.object?.sha
    if (target.ref !== ref || target.object?.type !== 'commit' || !fullSha(targetTip))
      throw new Block('safety', 'GitHub did not report the exact target ref')
    const options = { cwd: source, signal, timeout: 300000 }
    const local = (...args: string[]) => git(options, '--no-replace-objects', ...args)
    if (
      !(await local('cat-file', '-e', `${targetTip}^{commit}`).then(
        () => true,
        () => false,
      ))
    )
      await local('fetch', '--no-tags', '--no-write-fetch-head', '--refmap=', remote, ref)
    const ancestor = (older: string, newer: string) =>
      local('merge-base', '--is-ancestor', older, newer).then(
        () => true,
        () => false,
      )
    if (!(await ancestor(sha, targetTip)))
      throw new Block('safety', 'The GitHub target does not contain the reported merge commit')
    const [parent, candidate, extra] = (await local('show', '-s', '--format=%P', sha)).split(' ')
    if (!fullSha(parent) || candidate !== d.candidate || extra !== undefined)
      throw new Block(
        'safety',
        'The reported merge does not have the exact candidate as second parent',
      )
    if (!(await ancestor(d.baseline, parent)))
      throw new Block('safety', 'The merge target parent does not contain the verified baseline')
    if (
      (await local('rev-parse', `${sha}^{tree}`)) !== d.tree ||
      (await local('rev-parse', `${candidate}^{tree}`)) !== d.tree
    )
      throw new Block('safety', 'The reported merge and candidate must match the verified tree')
    result.observedMerge = { targetTip, parent }
    decide(
      d.mergeIntent ? 'observed GitHub merge after recorded intent' : 'observed external merge',
    )
  }
  return result
}

const causeOf = (error: unknown): Cause => {
  if (error instanceof Block) return error.cause
  if (error instanceof GithubRequestError) {
    if (error.status === 401 || error.status === 403) return 'auth'
    return error.definitive ? 'safety' : 'github'
  }
  return 'github'
}

export async function advanceDelivery(
  source: string,
  delivery: Delivery,
  save: (delivery: Delivery) => Promise<void>,
  signal: AbortSignal,
  api: Github = github(source, signal),
  now = Date.now(),
) {
  const d = structuredClone(delivery)
  const { repository, remote, base } = d.settings
  const prefix = `repos/${repository}`
  const decide = (what: string, why?: string) => {
    d.decisions = [...(d.decisions ?? []).slice(-19), { at: now, what, ...(why ? { why } : {}) }]
  }
  const persist = async () => {
    if (d.stage !== delivery.stage) d.since = now
    await save(d)
    return d
  }
  const head = async (branch: string) => {
    const path = branch.split('/').map(encodeURIComponent).join('/')
    const refs = await api<{ ref: string; object: { type: string; sha: string } }[]>(
      `${prefix}/git/matching-refs/heads/${path}`,
    )
    const found = refs.find((item) => item.ref === `refs/heads/${branch}`)
    if (!found) return undefined
    if (found.object.type !== 'commit' || !found.object.sha)
      throw new Block('safety', `Cannot establish the current ${branch} commit`)
    return found.object.sha
  }
  const requireBaseline = async () => {
    const target = await head(base)
    if (!target) throw new Block('safety', `Cannot establish the current ${base} ref`)
    if (target === d.baseline) return
    if (d.publishIntent && !d.published)
      throw new Block('uncertain-write', `${base} changed while publication was unconfirmed`)
    const comparison = await api<{ status: string; merge_base_commit: { sha: string } }>(
      `${prefix}/compare/${d.baseline}...${target}?per_page=1`,
    )
    if (comparison.status !== 'ahead' || comparison.merge_base_commit.sha !== d.baseline)
      throw new Block('safety', `${base} is no longer a descendant of the verified base`)
    throw new Block('stale', `${base} moved to ${target.slice(0, 7)} since the candidate was built`)
  }
  let write: 'create' | 'merge' | undefined
  if (
    d.stage === 'blocked' ||
    d.stage === 'closed' ||
    d.stage === 'review' ||
    (d.stage === 'merged' && (d.observedMerge || (d.mergeReceipt && d.mergeReceipt === d.merged)))
  )
    return d
  const readPull = () => api<Pull>(`${prefix}/pulls/${d.pr}`)
  const settle = async (pull: Pull) => {
    const terminal = await terminalPull(source, d, pull, signal, api, now)
    if (terminal) await save(terminal)
    return terminal
  }
  try {
    if (d.stage === 'ci' || d.stage === 'merge' || d.stage === 'merged') {
      const terminal = await settle(await readPull())
      if (terminal) return terminal
      if (d.stage === 'merged') throw new Block('safety', 'The recorded merged PR is now open')
    }
    if (d.runtime !== deliveryRuntime())
      throw new Block('runtime', 'Verification runtime changed; verify a new delivery')
    if (waits(d)?.on === 'publish') return d
    if (d.stage === 'publish') {
      if (d.publishIntent && !d.published)
        decide('reconcile publication', 'a recorded push intent was not confirmed')
      const destinations = await git(source, 'remote', 'get-url', '--push', '--all', remote)
      if (
        ![
          `git@github.com:${repository}.git`,
          `https://github.com/${repository}.git`,
          `https://github.com/${repository}`,
        ].includes(destinations)
      )
        throw new Block('safety', 'Push remote does not match the authorized repository')
      const existing = await head(d.branch)
      if (existing && existing !== d.candidate)
        throw new Block('safety', 'Delivery branch collision; refusing to overwrite it')
      if (!existing) {
        await requireBaseline()
        if (!d.publishIntent) {
          d.publishIntent = true
          try {
            await persist()
          } catch (error) {
            delete d.publishIntent
            throw error
          }
        }
        await git(
          { cwd: source, signal, timeout: 300000 },
          'push',
          '--no-follow-tags',
          '--recurse-submodules=no',
          remote,
          `${d.candidate}:refs/heads/${d.branch}`,
        )
      }
      d.published = true
      d.stage = 'pr'
      return persist()
    }
    if (d.stage === 'pr') {
      const pulls = await api<Pull[]>(
        `${prefix}/pulls?state=all&head=${encodeURIComponent(repository.split('/')[0] + ':' + d.branch)}&per_page=100`,
      )
      if (pulls.length > 1) throw new Block('safety', 'Multiple PRs use this delivery branch')
      let pull = pulls[0]
      if (!pull) {
        if (d.createIntent)
          throw new Block(
            'uncertain-write',
            'PR creation outcome is uncertain; reconcile it before retrying',
          )
        if (d.risk === 'high' && !d.publishIntent) {
          if ((await head(d.branch)) !== d.candidate)
            throw new Block('safety', 'Delivery branch no longer matches the approved candidate')
          await requireBaseline()
        }
        d.createIntent = true
        try {
          await persist()
        } catch (error) {
          delete d.createIntent
          throw error
        }
        write = 'create'
        pull = await api<Pull>(`${prefix}/pulls`, 'POST', {
          head: d.branch,
          base,
          ...pullRequestText(d),
        })
      }
      assertPull(d, pull)
      d.pr = pull.number
      d.url = pull.html_url
      d.stage = 'ci'
      return persist()
    }
    if (d.mergeIntent)
      throw new Block('uncertain-write', 'Merge outcome is uncertain; reconcile before retrying')
    const { protection, checks } = await readChecks(api, d)
    const required = assertProtection(d, protection)
    const ours = (check: Check) =>
      check.head_sha === d.candidate &&
      check.app.slug === 'github-actions' &&
      d.settings.requiredChecks.includes(check.name) &&
      required.checks.some(
        (expected) => expected.context === check.name && expected.app_id === check.app.id,
      )
    const rerun = async (why: string, check: Check) => {
      if ((d.reruns ?? 0) >= MAX_RERUNS)
        throw new Block('infra', `${why}; ${MAX_RERUNS} automatic reruns spent`)
      const own = /\/actions\/runs\/(\d+)/.exec(check.details_url ?? '')?.[1]
      if (!own) throw new Block('infra', `${why}; the check names no workflow run to rerun`)
      const run = await api<{ id: number; status: string; head_sha: string }>(
        `${prefix}/actions/runs/${own}`,
      )
      if (run.head_sha !== d.candidate)
        throw new Block('safety', 'The workflow run is not for the candidate')
      const done = run.status === 'completed'
      if (!done && d.cancelled === run.id)
        throw new Block('infra', `${why}; its cancellation never completed`)
      if (done) d.reruns = (d.reruns ?? 0) + 1
      else d.cancelled = run.id
      d.rerunAt = now
      d.since = now
      delete d.rerun
      decide(done ? 'rerun CI' : 'cancel the stuck CI run; its cancellation is rerun next', why)
      await persist()
      await api(`${prefix}/actions/runs/${run.id}/${done ? 'rerun' : 'cancel'}`, 'POST')
    }
    const failed = checks.find(
      (check) =>
        ours(check) &&
        check.status === 'completed' &&
        check.conclusion !== 'success' &&
        (d.rerunAt === undefined || Date.parse(check.completed_at ?? '') > d.rerunAt),
    )
    if (failed) {
      const what = `Required GitHub check ${failed.name}: ${failed.conclusion ?? 'unknown conclusion'}`
      if (failed.conclusion === 'failure' && !d.rerun) throw new Block('check-failed', what)
      await rerun(what, failed)
      d.stage = 'ci'
      return persist()
    }
    if (!checksPassed(d, protection, checks)) {
      if (now - (d.since ?? d.checkedAt) > CI_LIMIT_MS) {
        const stuck = checks.find((check) => ours(check) && check.status !== 'completed')
        if (!stuck)
          throw new Block(
            'infra',
            'A required check did not start within an hour; nothing to rerun',
          )
        await rerun('required checks did not finish within an hour', stuck)
      }
      d.stage = 'ci'
      return persist()
    }
    if (d.stage !== 'merge') {
      d.stage = 'merge'
      return persist()
    }
    if (d.risk !== 'low' && !d.mergeApproved) return d
    const fresh = await readPull()
    const terminal = await settle(fresh)
    if (terminal) return terminal
    try {
      await requireBaseline()
    } catch (error) {
      if (!(error instanceof Block) || error.cause !== 'stale') throw error
      const raced = await settle(await readPull())
      if (raced) return raced
      throw error
    }
    if (fresh.base.sha !== d.baseline)
      throw new Block('safety', 'The fresh PR base commit differs from the verified baseline')
    d.mergeIntent = true
    try {
      await persist()
    } catch (error) {
      delete d.mergeIntent
      throw error
    }
    signal.throwIfAborted()
    write = 'merge'
    const merged = await api<{ merged: boolean; sha: string }>(
      `${prefix}/pulls/${d.pr}/merge`,
      'PUT',
      {
        sha: d.candidate,
        merge_method: 'merge',
      },
    )
    if (typeof merged.merged !== 'boolean')
      throw new Block('uncertain-write', 'GitHub returned no exact merge receipt')
    if (!merged.merged) {
      delete d.mergeIntent
      throw new Block('github', 'GitHub refused the merge')
    }
    if (!fullSha(merged.sha))
      throw new Block('uncertain-write', 'GitHub returned no exact merge receipt')
    d.mergeReceipt = merged.sha
    return persist()
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof GithubRequestError && error.definitive) {
      if (write === 'create') delete d.createIntent
      if (write === 'merge') delete d.mergeIntent
    }
    d.resumeStage = d.stage as Exclude<Stage, 'blocked'>
    d.stage = 'blocked'
    d.cause = causeOf(error)
    d.reason =
      error instanceof Error ? error.message.split('\n')[0].slice(0, 240) : 'Delivery failed'
    decide(`blocked: ${d.cause}`, d.reason)
    return persist()
  }
}
