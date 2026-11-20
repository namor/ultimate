import { exec } from '../../lib/exec.ts'
import { git } from '../../lib/git.ts'
import { CI_LIMIT_MS, MAX_RERUNS } from './delivery.ts'
import type { Cause, Delivery, Stage } from './delivery.ts'

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
    const args = ['api', '--include', '--method', method, path]
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
      return JSON.parse(output.slice(boundary.index + boundary[0].length)) as T
    } catch {
      throw new GithubRequestError()
    }
  }

export async function closePull(api: Github, repository: string, pr: number, comment: string) {
  await api(`repos/${repository}/issues/${pr}/comments`, 'POST', { body: comment })
  await api(`repos/${repository}/pulls/${pr}`, 'PATCH', { state: 'closed' })
}

export function assertPull(delivery: Delivery, pull: Pull) {
  const { repository, base } = delivery.settings
  if (
    pull.head.sha !== delivery.candidate ||
    pull.head.ref !== delivery.branch ||
    pull.head.repo?.full_name !== repository ||
    pull.base.repo.full_name !== repository ||
    pull.base.ref !== base
  )
    throw new Block('safety', 'PR identity changed; delivery stopped')
}

export function checksPassed(delivery: Delivery, protection: Protection, checks: Check[]) {
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

const causeOf = (error: unknown, write: 'create' | 'merge' | undefined): Cause => {
  if (error instanceof Block) return error.cause
  if (error instanceof GithubRequestError) {
    if (error.status === 401 || error.status === 403) return 'auth'
    if (write === 'merge' && (error.status === 405 || error.status === 409)) return 'stale'
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
  let write: 'create' | 'merge' | undefined
  if (d.stage === 'blocked' || d.stage === 'merged' || d.stage === 'review') return d
  try {
    if (d.runtime !== deliveryRuntime())
      throw new Block('runtime', 'Verification runtime changed; verify a new delivery')
    if (d.stage === 'publish') {
      if (d.risk === 'high' && !d.publishApproved) return d
      const url = await git(source, 'remote', 'get-url', '--push', remote)
      if (
        ![
          `git@github.com:${repository}.git`,
          `https://github.com/${repository}.git`,
          `https://github.com/${repository}`,
        ].includes(url)
      )
        throw new Block('safety', 'Push remote does not match the authorized repository')
      const existing = await git(
        { cwd: source, signal, timeout: 30000 },
        'ls-remote',
        remote,
        `refs/heads/${d.branch}`,
      )
      if (existing && existing.split(/\s/)[0] !== d.candidate)
        throw new Block('safety', 'Delivery branch collision; refusing to overwrite it')
      if (!existing)
        await git(
          { cwd: source, signal, timeout: 300000 },
          'push',
          remote,
          `${d.candidate}:refs/heads/${d.branch}`,
        )
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
        d.createIntent = true
        await persist()
        write = 'create'
        pull = await api<Pull>(`${prefix}/pulls`, 'POST', {
          head: d.branch,
          base,
          title: d.text?.title ?? `Delivery ${d.candidate.slice(0, 7)}`,
          body:
            d.text?.body ??
            `Risk: ${d.risk}\n\nCandidate: ${d.candidate}\nTested tree: ${d.tree}\n\nIndependent review: ${d.review}`,
        })
      }
      assertPull(d, pull)
      d.pr = pull.number
      d.url = pull.html_url
      d.stage = 'ci'
      return persist()
    }
    const pull = await api<Pull>(`${prefix}/pulls/${d.pr}`)
    assertPull(d, pull)
    if (pull.merged) {
      if (!d.mergeIntent)
        throw new Block('safety', 'PR merged outside this delivery; human reconciliation required')
      if (!pull.merge_commit_sha) throw new Block('github', 'GitHub did not report a merge commit')
      d.merged = pull.merge_commit_sha
      d.stage = 'merged'
      return persist()
    }
    if (pull.state !== 'open') throw new Block('closed', 'Delivery PR was closed without merging')
    if (d.mergeIntent)
      throw new Block('uncertain-write', 'Merge outcome is uncertain; reconcile before retrying')
    const protection = await api<Protection>(
      `${prefix}/branches/${encodeURIComponent(base)}/protection`,
    )
    const pages = await api<{ check_runs: Check[]; total_count: number }>(
      `${prefix}/commits/${d.candidate}/check-runs?filter=latest&per_page=100`,
    )
    if (pages.total_count > 100)
      throw new Block('safety', 'Too many checks to establish unambiguous delivery evidence')
    const rerun = async (why: string) => {
      if ((d.reruns ?? 0) >= MAX_RERUNS)
        throw new Block('infra', `${why}; ${MAX_RERUNS} automatic reruns spent`)
      const runs = await api<{ workflow_runs: { id: number; status: string }[] }>(
        `${prefix}/actions/runs?head_sha=${d.candidate}&per_page=1`,
      )
      const run = runs.workflow_runs[0]
      if (!run) throw new Block('infra', 'No workflow run exists for the candidate')
      const done = run.status === 'completed'
      await api(`${prefix}/actions/runs/${run.id}/${done ? 'rerun' : 'cancel'}`, 'POST')
      if (done) d.reruns = (d.reruns ?? 0) + 1
      d.rerunAt = now
      d.since = now
      delete d.rerun
      decide(done ? 'rerun CI' : 'cancel the stuck CI run; its cancellation is rerun next', why)
    }
    const failed = pages.check_runs.find(
      (check) =>
        d.settings.requiredChecks.includes(check.name) &&
        check.head_sha === d.candidate &&
        check.status === 'completed' &&
        check.conclusion !== 'success' &&
        (d.rerunAt === undefined || Date.parse(check.completed_at ?? '') > d.rerunAt),
    )
    if (failed) {
      const what = `Required GitHub check ${failed.name}: ${failed.conclusion ?? 'unknown conclusion'}`
      if (failed.conclusion === 'failure' && !d.rerun) throw new Block('check-failed', what)
      await rerun(what)
      d.stage = 'ci'
      return persist()
    }
    if (!checksPassed(d, protection, pages.check_runs)) {
      if (now - (d.since ?? d.checkedAt) > CI_LIMIT_MS)
        await rerun('required checks did not finish within an hour')
      d.stage = 'ci'
      return persist()
    }
    if (d.stage !== 'merge') {
      d.stage = 'merge'
      return persist()
    }
    if (d.risk !== 'low' && !d.mergeApproved) return d
    const fresh = await api<Pull>(`${prefix}/pulls/${d.pr}`)
    assertPull(d, fresh)
    await git(
      { cwd: source, signal, timeout: 300000 },
      'fetch',
      '--no-tags',
      remote,
      `refs/heads/${base}`,
    )
    const target = await git(source, 'rev-parse', 'FETCH_HEAD')
    await git(source, 'merge-base', '--is-ancestor', d.baseline, target)
    if (target !== d.baseline)
      throw new Block(
        'stale',
        `${base} moved to ${target.slice(0, 7)} since the candidate was built`,
      )
    d.mergeIntent = true
    try {
      await persist()
    } catch (error) {
      delete d.mergeIntent
      throw error
    }
    write = 'merge'
    const merged = await api<{ merged: boolean; sha: string }>(
      `${prefix}/pulls/${d.pr}/merge`,
      'PUT',
      {
        sha: d.candidate,
        merge_method: 'merge',
      },
    )
    if (!merged.merged) {
      delete d.mergeIntent
      throw new Block('github', 'GitHub refused the merge')
    }
    return persist()
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof GithubRequestError && error.definitive) {
      if (write === 'create') delete d.createIntent
      if (write === 'merge') delete d.mergeIntent
    }
    d.resumeStage = d.stage as Exclude<Stage, 'blocked'>
    d.stage = 'blocked'
    d.cause = causeOf(error, write)
    d.reason =
      error instanceof Error ? error.message.split('\n')[0].slice(0, 240) : 'Delivery failed'
    decide(`blocked: ${d.cause}`, d.reason)
    return persist()
  }
}
