import { exec } from '../../lib/exec.ts'
import { git } from '../../lib/git.ts'
import type { DeliverySettings } from './delivery-settings.ts'

export type DeliveryRisk = 'low' | 'medium' | 'high'
/** Kept on the queue across replacement lander tasks, including uncertain external writes. */
export type Delivery = {
  settings: DeliverySettings
  risk: DeliveryRisk
  review: string
  baseline: string
  candidate: string
  tree: string
  branch: string
  checkedAt: number
  runtime: string
  deadline?: number
  stage: 'review' | 'publish' | 'pr' | 'ci' | 'merge' | 'merged' | 'blocked'
  published?: boolean
  createIntent?: boolean
  mergeIntent?: boolean
  pr?: number
  url?: string
  merged?: string
  publishApproved?: boolean
  mergeApproved?: boolean
  reason?: string
  resumeStage?: 'review' | 'publish' | 'pr' | 'ci' | 'merge' | 'merged'
}

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
export const github =
  (cwd: string, signal: AbortSignal): Github =>
  async <T>(path: string, method = 'GET', fields: Record<string, string> = {}) => {
    const args = ['api', '--method', method, path]
    for (const [key, value] of Object.entries(fields)) args.push('-f', `${key}=${value}`)
    const { stdout } = await exec('gh', args, {
      cwd,
      signal,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    })
    return JSON.parse(stdout) as T
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
    throw new Error('PR identity changed; delivery stopped')
}

/** Only genuine success from the expected GitHub Actions app qualifies, never an empty/neutral/skipped rollup. */
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
    throw new Error('Strict PR/check protection including administrators is required')
  return required.checks.every((expected) => {
    const matches = checks.filter(
      (check) => check.name === expected.context && check.head_sha === delivery.candidate,
    )
    // Duplicate names or unknown producers are ambiguous, not green.
    return (
      matches.length === 1 &&
      matches[0].status === 'completed' &&
      matches[0].conclusion === 'success' &&
      matches[0].app.slug === 'github-actions' &&
      matches[0].app.id === expected.app_id
    )
  })
}

/** One bounded transition. Persist intent before a write, reconcile before repeating after interruption. */
export async function advanceDelivery(
  source: string,
  delivery: Delivery,
  save: (delivery: Delivery) => Promise<void>,
  signal: AbortSignal,
  api: Github = github(source, signal),
) {
  const d = structuredClone(delivery)
  const { repository, remote, base } = d.settings
  const prefix = `repos/${repository}`
  const persist = async () => {
    await save(d)
    return d
  }
  if (d.stage === 'blocked' || d.stage === 'merged' || d.stage === 'review') return d
  try {
    if (d.stage === 'publish') {
      if (d.runtime !== deliveryRuntime())
        throw new Error('Verification runtime changed; verify a new delivery')
      if (d.risk === 'high' && !d.publishApproved) return d
      const url = await git(source, 'remote', 'get-url', '--push', remote)
      if (
        ![
          `git@github.com:${repository}.git`,
          `https://github.com/${repository}.git`,
          `https://github.com/${repository}`,
        ].includes(url)
      )
        throw new Error('Push remote does not match the authorized repository')
      const existing = await git(
        { cwd: source, signal, timeout: 30000 },
        'ls-remote',
        remote,
        `refs/heads/${d.branch}`,
      )
      if (existing && existing.split(/\s/)[0] !== d.candidate)
        throw new Error('Delivery branch collision; refusing to overwrite it')
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
      // Include closed/merged PRs: a missing response must not create a second delivery.
      const pulls = await api<Pull[]>(
        `${prefix}/pulls?state=all&head=${encodeURIComponent(repository.split('/')[0] + ':' + d.branch)}&per_page=100`,
      )
      if (pulls.length > 1) throw new Error('Multiple PRs use this delivery branch')
      let pull = pulls[0]
      if (!pull) {
        if (d.createIntent)
          throw new Error('PR creation outcome is uncertain; reconcile it before retrying')
        d.createIntent = true
        await persist()
        pull = await api<Pull>(`${prefix}/pulls`, 'POST', {
          head: d.branch,
          base,
          title: `Delivery ${d.candidate.slice(0, 7)}`,
          body: `Risk: ${d.risk}\n\nCandidate: ${d.candidate}\nTested tree: ${d.tree}\n\nIndependent review: ${d.review}\n\nLocal verification passed before publication.`,
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
        throw new Error('PR merged outside this delivery; human reconciliation required')
      if (!pull.merge_commit_sha) throw new Error('GitHub did not report a merge commit')
      d.merged = pull.merge_commit_sha
      d.stage = 'merged'
      return persist()
    }
    if (pull.state !== 'open') throw new Error('Delivery PR was closed without merging')
    if (d.mergeIntent) throw new Error('Merge outcome is uncertain; reconcile before retrying')
    const protection = await api<Protection>(
      `${prefix}/branches/${encodeURIComponent(base)}/protection`,
    )
    const pages = await api<{ check_runs: Check[]; total_count: number }>(
      `${prefix}/commits/${d.candidate}/check-runs?filter=latest&per_page=100`,
    )
    if (pages.total_count > 100)
      throw new Error('Too many checks to establish unambiguous delivery evidence')
    const failed = pages.check_runs.find(
      (check) =>
        d.settings.requiredChecks.includes(check.name) &&
        check.head_sha === d.candidate &&
        check.status === 'completed' &&
        check.conclusion !== 'success',
    )
    if (failed)
      throw new Error(
        `Required GitHub check ${failed.name}: ${failed.conclusion ?? 'unknown conclusion'}`,
      )
    if (!checksPassed(d, protection, pages.check_runs)) {
      d.stage = 'ci'
      return persist()
    }
    if (d.stage !== 'merge') {
      d.stage = 'merge'
      return persist()
    }
    if (d.risk !== 'low' && !d.mergeApproved) return d
    if (d.runtime !== deliveryRuntime())
      throw new Error('Verification runtime changed; verify a new delivery')
    // #45669: user866 accepts no concurrent retarget during this immediate merge window.
    // GitHub has a head CAS but no atomic base-ref comparison; do not replace this with deferred auto-merge.
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
    await git(source, 'merge-base', '--is-ancestor', target, d.candidate)
    d.mergeIntent = true
    await persist()
    const merged = await api<{ merged: boolean; sha: string }>(
      `${prefix}/pulls/${d.pr}/merge`,
      'PUT',
      {
        sha: d.candidate,
        merge_method: 'merge',
      },
    )
    if (!merged.merged) throw new Error('GitHub refused the merge')
    // Confirm on the next transition, including after a lost response.
    return persist()
  } catch (error) {
    signal.throwIfAborted()
    d.resumeStage = d.stage as 'review' | 'publish' | 'pr' | 'ci' | 'merge'
    d.stage = 'blocked'
    // gh/git errors may include remote diagnostics; keep the durable user-facing reason bounded.
    d.reason =
      error instanceof Error ? error.message.split('\n')[0].slice(0, 240) : 'Delivery failed'
    return persist()
  }
}
