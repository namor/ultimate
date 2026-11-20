import type {
  ConversationId,
  JsonObject,
  ConversationDocToken,
  Tx,
} from '@earendil-works/pi-durable'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { mkdir, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { copyJson } from '@earendil-works/chord/json'
import type { Context } from '@earendil-works/chord/context'
import { withAbortSignal } from '@earendil-works/chord/context'
import { defineTask, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import { debounce, deadline } from '../../lib/timers.ts'
import { git } from '../../lib/git.ts'
import { readWorktreeSetup } from '../../lib/worktree-setup.ts'
import { overshadowed, retriedLater, settled } from '../../lib/errors.ts'
import { needsRestart as restartNeeded } from '../../lib/layers.ts'
import { runGroup, sweepPidFiles } from '../../lib/process-group.ts'
import { landingWeight } from '../../lib/token-weight.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { CheckRan, SubmissionFailed, SubmissionLanded } from './api.ts'
import { setup } from './setup.ts'
import type { DeliverySettings } from './delivery-settings.ts'
import {
  askedUnderStanding,
  authorize,
  BRANCH_WAKES,
  MAX_REBUILDS,
  needsSlot,
  needsUser,
  park,
  pick,
  POLL_MS,
  standingAsk,
  waits,
} from './delivery.ts'
import { advanceDelivery, closePull, deliveryRuntime, github } from './advance.ts'
import { addCheckout, treePath } from './tree.ts'
import type { Landed, LanderEntry, LanderOutcome, QueueEntry, WorkspaceIndex } from './types.ts'
import { LanderLog } from './entries.ts'
import { LanderReportEntry } from './refs.ts'

const recentSubmitCardOutcomeLimit = 50
const maxCloseTries = 3
export async function landerPath(home: string, source: string, settings: JsonObject) {
  const configured = await treePath(settings, landerName(source))
  if (configured) return configured
  await mkdir(join(home, 'lander'), { recursive: true })
  return join(await realpath(join(home, 'lander')), landerHash(source))
}
const landerHash = (source: string) =>
  createHash('sha256').update(source).digest('hex').slice(0, 12)
const landerName = (source: string) => `ult-lander-${landerHash(source)}`
const checkoutCreationQueues = new Map<string, Promise<string>>()
export async function landerCheckout(
  home: string,
  source: string,
  settings: JsonObject,
  tip = 'HEAD',
) {
  const path = await landerPath(home, source, settings)
  const queued = settled(checkoutCreationQueues.get(path) ?? Promise.resolve()).then(async () => {
    const registered = (await git(source, 'worktree', 'list', '--porcelain'))
      .split('\n\n')
      .some((entry) => entry.split('\n').includes(`worktree ${path}`))
    if (!registered) {
      await rm(path, { recursive: true, force: true })
      await git(source, 'worktree', 'prune')
      await addCheckout(settings, source, path, landerName(source), ['--detach', tip])
    }
    return path
  })
  checkoutCreationQueues.set(path, queued)
  try {
    return await queued
  } finally {
    if (checkoutCreationQueues.get(path) === queued) checkoutCreationQueues.delete(path)
  }
}
export const log = (
  tx: Tx,
  id: ConversationId,
  entry: Pick<
    QueueEntry,
    'id' | 'conversationId' | 'tip' | 'target' | 'at' | 'divergence' | 'subject' | 'steps'
  >,
  data: Omit<LanderEntry, 'submission' | 'conversationId' | 'tip' | 'target' | 'at'>,
) => {
  const at = Date.now()
  if (data.step)
    entry.steps.push({
      step: data.step,
      at,
      ...(data.runs ? { runs: data.runs } : {}),
      ...(data.check ? { check: data.check } : {}),
    })
  return tx.appendEntry(LanderLog, id, {
    data: {
      submission: entry.id,
      conversationId: entry.conversationId,
      tip: entry.tip,
      target: entry.target,
      at,
      sourceEntry: entry.at,
      divergence: entry.divergence,
      ...(entry.subject && (data.step === 'queued' || data.step === 'started' || data.outcome)
        ? { subject: entry.subject }
        : {}),
      ...data,
    },
  })
}
const starterLine = (
  branch: ConversationId,
  sha: string,
  outcome: WorkspaceIndex['results'][string],
) =>
  [
    `#${branch}${outcome.subject?.title ? ` ${outcome.subject.title}` : ''} ${outcome.commits?.length ? `landed as ${sha.slice(0, 7)} on ${outcome.target}` : `had nothing new to land on ${outcome.target}`}`,
    ...(outcome.pushed ? [`pushed`] : []),
    ...(outcome.reason ? [outcome.reason] : []),
    ...(outcome.needsRestart ? ['needs restart'] : []),
    ...(outcome.flaky?.length ? [`flaky: ${outcome.flaky.join(', ')}`] : []),
  ]
    .join(' · ')
    .replace(/\s*\n\s*/g, ' ')

type Host = Pick<
  ExtensionHost,
  | 'home'
  | 'userHome'
  | 'ultimateRoot'
  | 'harness'
  | 'projectSettings'
  | 'doc'
  | 'metadata'
  | 'notice'
  | 'emit'
>
type Seconds = number
type Check = { command: string; timeout?: Seconds }
type ConcurrentCheckGroup = Check[]
type Settings = {
  checks: (Check | ConcurrentCheckGroup)[]
  push?: string
  delivery?: DeliverySettings
}
const maxTargetMoveAttempts = 3
type CheckLimits = { stall: Seconds; total: Seconds }
const defaultCheckLimitsSeconds: CheckLimits = { stall: 2 * 60, total: 10 * 60 }
export const limitsFor = (check: Check, limits: CheckLimits): CheckLimits =>
  check.timeout === undefined
    ? limits
    : { stall: Math.min(limits.stall, check.timeout), total: check.timeout }
const vitestFailureLine = /^\s*(FAIL|×|✗)\s/
const seconds = (value: number) => (value < 60 ? `${value} s` : `${+(value / 60).toFixed(1)} min`)

export const checkPids = (home: string) => join(home, 'lander-checks')
export const sweepChecks = async (home: string) => {
  const isResumedProcessCheck = (name: string) => name.startsWith(`${process.pid}-`)
  await sweepPidFiles(checkPids(home), isResumedProcessCheck)
  const names = await readdir(checkTemp(home)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  for (const name of names)
    if (!name.startsWith(`${process.pid}-`))
      await rm(join(checkTemp(home), name), { recursive: true, force: true })
}
export const checkTemp = (home: string) => join(tmpdir(), `ultimate-lander-${landerHash(home)}`)

export async function runLanderCheck(
  path: string,
  command: string,
  context: Context,
  pids: string,
  temp: string,
  limits: CheckLimits = defaultCheckLimitsSeconds,
): Promise<CheckRun> {
  const tmp = createTempBeforeWatchdog(temp)
  let output = ''
  let partial = ''
  const failed = new Set<string>()
  let stopped: string | undefined
  const watchdog = new AbortController()
  const signal = AbortSignal.any([
    watchdog.signal,
    ...(context.abortSignal ? [context.abortSignal] : []),
  ])
  const stop = (reason: string) => {
    if (signal.aborted) return
    stopped = reason
    watchdog.abort()
  }
  const stalled = () => stop(`Stalled: no output for ${seconds(limits.stall)}, stopped`)
  const stallDeadline = debounce(limits.stall * 1000, stalled)
  stallDeadline()
  const cancelTotal = deadline(limits.total * 1000, () =>
    stop(`Timed out after ${seconds(limits.total)}`),
  )
  const report = (reason: string, heading: string) => {
    const tests = [...failed].slice(-20)
    const failedFiles = [...failed]
      .filter((test) => test.startsWith('FAIL'))
      .map((test) => test.slice('FAIL'.length).replace(/\s+/g, ' ').trim())
    return {
      failure: [reason, ...(tests.length ? [heading, ...tests] : []), output].join('\n').trim(),
      cause: [reason, ...failedFiles.slice(0, 5)].join(': '),
    }
  }
  const onOutput = (text: string) => {
    output = (output + text).slice(-3000)
    const split = (partial + text).split('\n')
    partial = split.pop()!.slice(-1000)
    for (const line of split) {
      const plain = stripVTControlCharacters(line).trim()
      if (vitestFailureLine.test(plain)) failed.add(plain.slice(0, 300))
    }
    stallDeadline()
  }
  try {
    let exit: Awaited<ReturnType<typeof runGroup>>
    try {
      exit = await runGroup('/bin/bash', ['-c', command], {
        cwd: path,
        env: { ...process.env, TMPDIR: tmp },
        pidFile: join(pids, `${process.pid}-${randomUUID()}.pid`),
        signal,
        grace: 2000,
        onOutput,
      })
    } catch (error) {
      context.abortSignal?.throwIfAborted()
      return { failure: `${output}\n${String(error)}`.trim(), cause: String(error) }
    }
    context.abortSignal?.throwIfAborted()
    if (stopped) return { ...report(stopped, 'Failed tests so far:'), timedOut: true }
    if (exit.outOfMemory) return report(`Out of memory: exit ${exit.code}`, 'Failed tests so far:')
    if (exit.code !== 0) return report(`exit ${exit.code}`, 'Failed tests:')
    const last = lines(stripVTControlCharacters(output)).findLast((line) => line.trim())
    return { summary: last?.trim().slice(0, 200) }
  } finally {
    stallDeadline.cancel()
    cancelTotal()
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      retriedLater,
    )
  }
}

type CheckRun =
  | { failure?: undefined; summary?: string; timedOut?: undefined }
  | { failure: string; cause: string; summary?: undefined; timedOut?: boolean }

function createTempBeforeWatchdog(temp: string) {
  mkdirSync(temp, { recursive: true })
  return mkdtempSync(join(temp, `${process.pid}-`))
}

const parseCheck = (value: unknown): Check | undefined => {
  if (typeof value === 'string') return { command: value }
  if (!value || typeof value !== 'object') return undefined
  const { command, timeout } = value as { command?: unknown; timeout?: unknown }
  if (typeof command !== 'string') return undefined
  if (timeout === undefined) return { command }
  return typeof timeout === 'number' && timeout > 0 ? { command, timeout } : undefined
}
export const landerSettings = async (host: Pick<Host, 'projectSettings'>): Promise<Settings> => {
  const lander = (await host.projectSettings()).lander as
    | { checks?: unknown; push?: unknown }
    | undefined
  const entries = lander?.checks ?? []
  const checks = Array.isArray(entries)
    ? entries.map((entry) =>
        Array.isArray(entry)
          ? entry.length > 0
            ? entry.map(parseCheck)
            : [undefined]
          : parseCheck(entry),
      )
    : undefined
  if (!checks?.every((group) => (Array.isArray(group) ? group.every(Boolean) : group)))
    throw new Error(
      'lander.checks must be an array of checks or check groups; a check is a command or { "command", "timeout" } with timeout in seconds',
    )
  if (lander?.push !== undefined && typeof lander.push !== 'string')
    throw new Error('lander.push must be a remote name')
  const pushOutsidePreview =
    lander?.push && !process.env.ULTIMATE_PREVIEW_BRANCH ? lander.push : undefined
  return {
    checks: checks as Settings['checks'],
    ...(pushOutsidePreview ? { push: pushOutsidePreview } : {}),
  }
}
export const contains = (cwd: string, ancestor: string, descendant: string) =>
  git(cwd, 'merge-base', '--is-ancestor', ancestor, descendant).then(
    () => true,
    () => false,
  )
export async function fastForwardOnlyTargetBranch(
  source: string,
  target: string,
  base: string,
  integrated: string,
) {
  const worktree = (await git(source, 'worktree', 'list', '--porcelain'))
    .split('\n\n')
    .map((record) => record.split('\n'))
    .find((record) => record.includes(`branch refs/heads/${target}`))?.[0]
    .slice('worktree '.length)
  if (worktree) await git(worktree, 'merge', '-q', '--ff-only', integrated)
  else await git(source, 'update-ref', `refs/heads/${target}`, integrated, base)
}
const lines = (text: string) => text.split('\n').filter(Boolean)
const failure = (error: unknown) => {
  const output = error as Error & { stdout?: string; stderr?: string }
  return `${output.stdout ?? ''}${output.stderr ?? ''}${output.stdout || output.stderr ? '' : output.message}`
    .trim()
    .slice(-3000)
}
const remote = (cwd: string, signal: AbortSignal, ...args: string[]) =>
  git({ cwd, signal, timeout: 300000 }, ...args)

type CheckedIntegration = {
  checkedAt: number
  runtime: string
  base: string
  integrated: string
  flaky: string[]
}
const landedOutcome = (landed: Landed): LanderOutcome => ({
  outcome: 'landed',
  sha: landed.sha,
  base: landed.base,
  commits: landed.commits,
  paths: landed.paths,
  flaky: landed.flaky,
  ...(landed.weight ? { weight: landed.weight } : {}),
})
type CommittedDeliveryDecision = {
  phase: 'deliver'
  id: string
  conversationId: ConversationId
  headline: string
  outcome: WorkspaceIndex['results'][string]
  concluded: boolean
  starter?: ConversationId
}
type ConcludedBranchRelease = { phase: 'release'; conversationId: ConversationId }

type BranchReportHeldAsNote = ConversationId
type UnderwayReportPhase = {
  phase: 'report'
  id: string
  conversationId: BranchReportHeldAsNote
  text: string
  headline: string
  outcome: WorkspaceIndex['results'][string]
}

type State =
  | { phase: 'next' }
  | { phase: 'land'; id: string; attempt: number; pushRetried?: boolean }
  | UnderwayReportPhase
  | CommittedDeliveryDecision
  | { phase: 'card-failed'; error: string }
  | ConcludedBranchRelease

export async function hasPendingLanderReport(tx: Tx, index: WorkspaceIndex, id: ConversationId) {
  for (const taskId of Object.values(index.landers)) {
    const state = (await tx.task(taskId))?.state
    if (!state || state.status === 'terminal') continue
    const checkpoint = state.checkpoint as State | undefined
    if (checkpoint?.phase === 'report' && checkpoint.conversationId === id) return true
  }
  return false
}

export async function activeLandingCards(tx: Tx, index: WorkspaceIndex) {
  const results: string[] = []
  for (const taskId of Object.values(index.landers)) {
    const task = await tx.task(taskId)
    const checkpoint = task?.state.checkpoint as State | undefined
    if (checkpoint?.phase === 'deliver' && checkpoint.concluded && checkpoint.starter !== undefined)
      results.push(checkpoint.id)
  }
  return results
}

export const standingAskOwed = (
  index: Pick<WorkspaceIndex, 'standing'>,
  entry: Pick<QueueEntry, 'delivery'>,
  env: { now: number; runtime: string },
) => {
  const delivery = entry.delivery
  const wait = delivery && waits(delivery)
  if (!delivery || (wait?.on !== 'publish' && wait?.on !== 'merge')) return undefined
  const grant = index.standing
  if (authorize({ by: 'ultimate', standing: grant }, wait.on, delivery, 'waiting', env))
    return undefined
  return askedUnderStanding(delivery, wait.on, grant, env.now) ? undefined : wait.on
}

export async function askStanding(
  host: Pick<Host, 'harness' | 'notice'>,
  Workspaces: ConversationDocToken<WorkspaceIndex>,
  index: Pick<WorkspaceIndex, 'standing'>,
  entry: Pick<QueueEntry, 'id' | 'delivery'>,
  lander: ConversationId,
  context: Context,
) {
  const env = { now: Date.now(), runtime: deliveryRuntime() }
  const action = standingAskOwed(index, entry, env)
  if (!action) return true
  const delivery = entry.delivery!
  const grant = index.standing!
  const ultimate = await host.harness().conversation(grant.conversation, context)
  const sent = await ultimate
    ?.submit(
      {
        type: 'input',
        whenBusy: 'followUp',
        requestId: `delivery-standing:${entry.id}:${action}:${delivery.candidate}:${grant.instruction}`,
        content: `Delivery ${entry.id} (${delivery.risk} risk, ${delivery.candidate}) awaits ${action} approval and qualifies under the user's standing approval until ${new Date(grant.until).toISOString()}. Decide it: call workspaces/delivery with standing: true and your reason, or leave it for the user. Log: lander conversation #${lander}.`,
      },
      context,
    )
    .then(
      () => true,
      (error: unknown) => {
        context.abortSignal?.throwIfAborted()
        host.notice(`Delivery ${entry.id} standing wake failed: ${failure(error)}`)
        return false
      },
    )
  if (sent)
    await host.harness().commit(async (tx) => {
      const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
        (item) => item.id === entry.id,
      )
      if (saved?.delivery?.candidate === delivery.candidate)
        saved.delivery.asked = standingAsk(delivery, action, grant)
    }, context)
  return sent === true
}

export async function reportBlocked(
  host: Pick<Host, 'harness' | 'doc' | 'notice'>,
  Workspaces: ConversationDocToken<WorkspaceIndex>,
  id: string,
  context: Context,
) {
  const decided = await host.harness().commit(async (tx) => {
    const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
    const entry = index.queue.find((item) => item.id === id)
    const delivery = entry?.delivery
    if (!entry || !delivery || delivery.stage !== 'blocked') return undefined
    const fresh = !delivery.wake
    if (!delivery.wake) {
      const block = (delivery.blocks ?? 0) + 1
      const item = index.items[String(entry.conversationId)]
      const why = needsUser(delivery)
      const exhausted = !why && (item?.deliveryWakes ?? 0) >= BRANCH_WAKES
      delivery.blocks = block
      delivery.wake = why
        ? { block, to: 'user', why }
        : exhausted
          ? { block, to: 'ultimate' }
          : { block, to: 'branch' }
      if (!why && !exhausted && item) item.deliveryWakes = (item.deliveryWakes ?? 0) + 1
    }
    const standing = host.doc('ultimate.standing-agents')
    return {
      fresh,
      entry: copyJson(entry) as QueueEntry,
      lander: index.landerConversations[entry.source],
      wake: { ...delivery.wake },
      ultimate: standing
        ? ((await tx.doc(standing, ROOT_CONVERSATION_ID)).ultimate as ConversationId | undefined)
        : undefined,
    }
  }, context)
  if (!decided) return
  const { fresh, entry, wake, ultimate, lander } = decided
  const delivery = entry.delivery!
  const reason = delivery.reason ?? 'Delivery blocked'
  if (fresh) host.notice(`Delivery ${id} blocked: ${reason}`)
  const logs = delivery.url
    ? ` Failing check logs: ${delivery.url}/checks.`
    : ' Details are in the lander log.'
  const hint =
    wake.to === 'user'
      ? `Needs the user: ${wake.why}.`
      : wake.to === 'ultimate'
        ? `Its branch already had ${BRANCH_WAKES} repair attempts; decide for it: recheck, stop, or ask the user.`
        : 'Diagnose and repair it: recheck or stop it, or resubmit a repaired candidate.'
  const card = {
    kind: LanderReportEntry.kind,
    data: {
      id,
      outcome: {
        outcome: 'failed' as const,
        reason,
        hint,
        divergence: entry.divergence,
        conversationId: entry.conversationId,
        at: entry.at,
        target: entry.target,
        tip: entry.tip,
        lander,
        steps: entry.steps,
      },
    },
  }
  const text = `Delivery ${id} of candidate ${delivery.candidate} is blocked: ${reason}.${logs} ${hint}`
  const requestId = `delivery-blocked:${id}:${wake.block}`
  const branch = await host.harness().conversation(entry.conversationId, context)
  if (wake.to === 'branch') {
    await branch?.submit(
      { type: 'input', whenBusy: 'followUp', requestId, content: text, entry: card },
      context,
    )
    return
  }
  const note = (content: string) => ({
    type: 'write' as const,
    requestId,
    entry: { ...card, model: [{ role: 'user' as const, content, timestamp: Date.now() }] },
  })
  const decider = wake.to === 'ultimate' ? '@ultimate decides' : 'The user decides'
  await branch?.submit(note(`${text} ${decider}; do not recheck it.`), context)
  if (ultimate === undefined) return
  const standing = await host.harness().conversation(ultimate, context)
  if (wake.to === 'ultimate')
    await standing?.submit(
      {
        type: 'input',
        whenBusy: 'followUp',
        requestId,
        content: `#${entry.conversationId}'s ${text}`,
        entry: card,
      },
      context,
    )
  else
    await standing?.submit(
      note(`#${entry.conversationId}'s ${text} Ask the user with a card.`),
      context,
    )
}

export function createLander(
  host: Host,
  Workspaces: ConversationDocToken<WorkspaceIndex>,
  serializeSourceWrites: <T>(source: string, operation: () => Promise<T>) => Promise<T>,
  after: {
    starter: (id: ConversationId, context: Context) => Promise<ConversationId | undefined>
    working: (tx: Tx, id: ConversationId) => Promise<boolean>
    conclude: (tx: Tx, id: ConversationId) => Promise<void>
    reserveLanding: import('./api.ts').BranchesService['reserveLanding']
    retireLanding: import('./api.ts').BranchesService['retireLanding']
    submitLanding: import('./api.ts').BranchesService['submitLanding']
    release: (id: ConversationId, context: Context) => Promise<unknown>
  },
  limits: CheckLimits = defaultCheckLimitsSeconds,
) {
  async function resetTrackedIntegration(source: string, tip: string) {
    const path = await landerCheckout(host.home, source, await host.projectSettings(), tip)
    await git(path, 'reset', '--hard', '-q')
    await git(path, 'checkout', '-q', '--detach', '--force', tip)
    await git(path, 'clean', '-fdq')
    return path
  }

  const Lander = defineTask<{ source: string }, State, null>({
    name: 'workspaces.lander',
    version: 1,
    initial: () => ({ phase: 'next' }),
    phases: {
      next: async (task, runtime, context) => {
        const { source } = task.input
        const closing = (await runtime.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))?.closing
        for (const pull of closing?.filter((item) => item.source === source) ?? []) {
          const closed = await closePull(
            github(source, runtime.signal),
            pull.repository,
            pull.pr,
            `${pull.note} Closed by the lander; nothing was merged.`,
          ).then(
            () => true,
            (error: unknown) => {
              runtime.signal.throwIfAborted()
              host.notice(`Closing PR #${pull.pr} failed: ${failure(error)}`)
              return false
            },
          )
          await runtime.commit(async (tx) => {
            const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
            const same = (item: { pr: number; repository: string }) =>
              item.pr === pull.pr && item.repository === pull.repository
            const exhausted = !closed && (pull.tries ?? 0) + 1 >= maxCloseTries
            index.closing = index.closing?.flatMap((item) =>
              !same(item)
                ? [item]
                : closed || exhausted
                  ? []
                  : [{ ...item, tries: (item.tries ?? 0) + 1 }],
            )
            if (exhausted) {
              const warning = `PR #${pull.pr} could not be closed, close it by hand`
              const owner = [
                ...Object.values(index.results),
                ...index.queue.filter((item) => item.source === pull.source),
              ].find(
                (item) =>
                  item.delivery?.settings.repository === pull.repository &&
                  (item.delivery.pr === pull.pr || 'rebuilds' in item),
              )
              if (owner && 'reason' in owner) owner.reason = `${owner.reason ?? ''}; ${warning}`
              else if (owner?.delivery)
                owner.delivery.decisions = [
                  ...(owner.delivery.decisions ?? []),
                  { at: runtime.now(), what: 'close failed', why: warning },
                ]
              host.notice(warning)
            }
          }, context)
        }
        const owed = await runtime.snapshot(Workspaces, ROOT_CONVERSATION_ID, context)
        const env = { now: runtime.now(), runtime: deliveryRuntime() }
        let asked = true
        for (const item of owed?.queue ?? [])
          if (item.source === source && standingAskOwed(owed!, item, env))
            asked =
              (await askStanding(host, Workspaces, owed!, item, runtime.conversationId, context)) &&
              asked
        await runtime.commit(async (tx) => {
          const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
          const mine = index.queue.filter((item) => item.source === source)
          for (const item of mine) park(item)
          const choice = pick(index.queue, runtime.now(), (item) => item.source === source)
          const pending =
            !asked ||
            index.closing?.some((item) => item.source === source) ||
            mine.some((item) => needsSlot(index.queue, item) || standingAskOwed(index, item, env))
          if (!choice && pending)
            return {
              status: 'sleeping',
              until: runtime.now() + POLL_MS,
              checkpoint: { phase: 'next' },
            }
          if (!choice) {
            delete index.landers[task.input.source]
            return { status: 'terminal', outcome: { status: 'completed', result: null } }
          }
          if ('until' in choice)
            return { status: 'sleeping', until: choice.until, checkpoint: { phase: 'next' } }
          const entry = index.queue[choice.ready]
          entry.state = 'landing'
          if (entry.delivery) entry.delivery.slot = true
          else await log(tx, runtime.conversationId, entry, { step: 'started' })
          return { status: 'running', checkpoint: { phase: 'land', id: entry.id, attempt: 1 } }
        }, context)
      },
      land: async (task, runtime, context) => {
        const { id, attempt, pushRetried } = task.state.checkpoint
        const { signal } = runtime
        const index = (await runtime.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))!
        const entry = index.queue.find((item) => item.id === id)
        if (!entry)
          return runtime.commit(
            () => ({ status: 'running', checkpoint: { phase: 'next' } }),
            context,
          )
        const { source, target } = entry
        const round = entry.rebuilds ? `${entry.rebuilds}.${attempt}` : `${attempt}`
        const recordedFirstFastForward = async () =>
          (await runtime.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))!.queue.find(
            (item) => item.id === id,
          )?.landed
        const step = (
          text: string,
          {
            runs,
            result,
            output,
            ran,
          }: {
            runs?: string
            result?: LanderEntry['check']
            output?: string
            ran?: { ms: number; timedOut?: boolean }
          } = {},
        ) =>
          runtime.commit(async (tx) => {
            const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
              (item) => item.id === id,
            )
            if (!saved) return
            saved.step = text
            await log(tx, runtime.conversationId, saved, {
              step: text,
              ...(runs ? { runs } : {}),
              ...(result ? { check: result } : {}),
              ...(output ? { output } : {}),
            })
            if (result && ran)
              await host.emit(tx, CheckRan, {
                submission: id,
                command: result.command,
                result: ran.timedOut ? 'timeout' : result.result,
                ms: Math.round(ran.ms),
              })
          }, context)
        const next = () =>
          runtime.commit(() => ({ status: 'running', checkpoint: { phase: 'next' } }), context)
        const rebuild = async (delivery: NonNullable<QueueEntry['delivery']>) => {
          const rebuilds = (entry.rebuilds ?? 0) + 1
          if (rebuilds > MAX_REBUILDS) {
            await runtime.commit(async (tx) => {
              const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
                (item) => item.id === id,
              )
              if (!saved?.delivery) return
              const block = (saved.delivery.blocks ?? 0) + 1
              saved.delivery.wake = { block, to: 'ultimate' }
              saved.delivery.blocks = block
              park(saved)
            }, context)
            await reportBlocked(host, Workspaces, id, context)
            return next()
          }
          await step(`rebuilding ${rebuilds}/${MAX_REBUILDS}: ${delivery.reason}`)
          await runtime.commit(async (tx) => {
            const draft = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
            const saved = draft.queue.find((item) => item.id === id)
            if (!saved) return { status: 'running', checkpoint: { phase: 'next' } }
            if (delivery.pr)
              draft.closing = [
                ...(draft.closing ?? []),
                {
                  source,
                  repository: delivery.settings.repository,
                  pr: delivery.pr,
                  note: `Superseded: ${delivery.reason}. The lander rebuilds this submission on the current base and opens a new PR.`,
                },
              ]
            saved.rebuilds = rebuilds
            saved.approvals = [...(saved.approvals ?? []), ...(delivery.approvals ?? [])]
            delete saved.delivery
            saved.state = 'queued'
            return { status: 'running', checkpoint: { phase: 'next' } }
          }, context)
        }
        const commitLandingOutcome = (text: string, outcome: LanderOutcome, sha = outcome.sha) =>
          runtime.commit(async (tx) => {
            const draft = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
            const steps = draft.queue.find((item) => item.id === id)!.steps
            draft.queue = draft.queue.filter((item) => item.id !== id)
            if (outcome.sha) {
              draft.items[String(entry.conversationId)].landed = outcome.sha
              delete draft.items[String(entry.conversationId)].deliveryWakes
            }
            draft.results[id] = {
              ...outcome,
              at: entry.at,
              divergence: entry.divergence,
              target: entry.target,
              tip: entry.tip,
              lander: runtime.conversationId,
              steps,
              conversationId: entry.conversationId,
              ...(entry.subject ? { subject: entry.subject } : {}),
              ...(entry.approvals ? { approvals: entry.approvals } : {}),
            }
            for (const old of Object.keys(draft.results).slice(0, -recentSubmitCardOutcomeLimit))
              delete draft.results[old]
            await log(tx, runtime.conversationId, entry, outcome)
            if (outcome.outcome === 'failed')
              await host.emit(tx, SubmissionFailed, {
                submission: id,
                conversationId: entry.conversationId,
                target: entry.target,
                reason: outcome.reason ?? '',
              })
            if (outcome.outcome === 'landed') {
              const subject = entry.subject ?? {}
              const commits = (outcome.commits ?? []).map((commit) => {
                const space = commit.indexOf(' ')
                return { sha: commit.slice(0, space), subject: commit.slice(space + 1) }
              })
              await host.emit(tx, SubmissionLanded, {
                submission: id,
                conversationId: entry.conversationId,
                at: entry.at,
                sha: outcome.sha!,
                base: outcome.base!,
                target: entry.target,
                lander: runtime.conversationId,
                divergence: entry.divergence,
                title:
                  subject.title ?? (await tx.doc(host.metadata, entry.conversationId)).title ?? '',
                ...(subject.summary ? { summary: subject.summary } : {}),
                ...(subject.feature ? { feature: subject.feature } : {}),
                commits: commits.slice(0, 10),
                commitCount: commits.length,
                paths: (outcome.paths ?? []).slice(0, 8),
                ...(outcome.pushed ? { pushed: outcome.pushed } : {}),
              })
            }
            return {
              status: 'running',
              checkpoint: {
                phase: 'report',
                id,
                conversationId: entry.conversationId,
                outcome: draft.results[id],
                headline: starterLine(entry.conversationId, sha ?? '', draft.results[id]),
                text: `[lander] Submission ${id} (#${entry.conversationId}, ${entry.tip.slice(0, 7)}) ${text}\nLog: lander conversation #${runtime.conversationId}.`,
              },
            }
          }, context)
        const summary = (landed: Landed, sha: string, how = '') =>
          [
            landed.commits.length
              ? `landed${how} as ${sha.slice(0, 7)} on ${entry.target}.`
              : `had nothing new to land on ${entry.target}.`,
            ...(landed.commits.length ? [`Commits:\n${landed.commits.join('\n')}`] : []),
            ...landed.flaky.map((command) => `Flaky: ${command}`),
          ].join('\n')
        const fail = async (reason: string, output?: string, hint?: string) => {
          const landed = await recordedFirstFastForward()
          const detail = [output ? `${reason}:\n${output}` : reason, ...(hint ? [hint] : [])].join(
            '\n',
          )
          const facts = {
            reason: landed ? `Push failed: ${reason}` : reason,
            ...(output ? { output } : {}),
            ...(hint ? { hint } : {}),
          }
          return landed
            ? commitLandingOutcome(
                `${summary(landed, landed.sha, ' locally')}\nPush failed: ${detail}`,
                {
                  ...landedOutcome(landed),
                  ...facts,
                },
              )
            : commitLandingOutcome(`was not landed: ${detail}`, {
                outcome: 'failed',
                ...facts,
              })
        }
        const retry = (retried = pushRetried) =>
          runtime.commit(
            () => ({
              status: 'running',
              checkpoint: {
                phase: 'land',
                id,
                attempt: attempt + 1,
                ...(retried ? { pushRetried: retried } : {}),
              },
            }),
            context,
          )
        const checkContext = withAbortSignal(signal, context)
        const push = async (settings: Settings, checkedCommit: string) => {
          if (!settings.push) return { text: 'Not pushed.' }
          await step(`pushing to ${settings.push}`)
          try {
            await remote(
              source,
              signal,
              'push',
              '-q',
              settings.push,
              `${checkedCommit}:refs/heads/${target}`,
            )
            return {
              remote: `${settings.push}/${target}`,
              text: `Pushed to ${settings.push}/${target}.`,
            }
          } catch (error) {
            if (signal.aborted) throw error
            if (!pushRetried) return { retry: retry(true) }
            return { retry: fail(`${settings.push} rejected the push`, failure(error)) }
          }
        }
        const landedReport = async (settings: Settings, landed: Landed, sha: string) => {
          const pushed = await push(settings, sha)
          if (pushed.retry) return pushed.retry
          const needsRestart =
            (await realpath(source)) === (await realpath(host.ultimateRoot)) &&
            restartNeeded(landed.paths)
          return commitLandingOutcome(
            [summary(landed, sha), pushed.text, ...(needsRestart ? ['Needs restart.'] : [])].join(
              '\n',
            ),
            {
              ...landedOutcome(landed),
              ...(pushed.remote ? { pushed: pushed.remote } : {}),
              ...(needsRestart ? { needsRestart } : {}),
            },
            sha,
          )
        }
        try {
          const settings: Settings = entry.delivery
            ? { checks: [], delivery: entry.delivery.settings }
            : entry.deliveryConfig === false
              ? { checks: (await landerSettings(host)).checks }
              : entry.deliveryConfig
                ? {
                    checks: entry.deliveryConfig.checks.map((command) => ({ command })),
                    delivery: entry.deliveryConfig,
                  }
                : await landerSettings(host)
          if (entry.delivery) {
            const previous = entry.delivery
            const save = (delivery: NonNullable<QueueEntry['delivery']>) =>
              runtime.commit(async (tx) => {
                const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
                  (item) => item.id === id,
                )
                if (!saved) throw new Error('Delivery was withdrawn while the lander advanced it')
                const current = saved.delivery
                if (
                  delivery.mergeIntent &&
                  !current?.mergeIntent &&
                  delivery.risk !== 'low' &&
                  !current?.mergeApproved
                )
                  throw new Error('Merge approval was withdrawn; approve again to merge')
                if (
                  delivery.publishIntent &&
                  !current?.publishIntent &&
                  delivery.risk === 'high' &&
                  !current?.publishApproved
                )
                  throw new Error('Publish approval was withdrawn; approve again to publish')
                const {
                  publishApproved: _p,
                  mergeApproved: _m,
                  approvals: _a,
                  slot: _s,
                  asked: _k,
                  ...rest
                } = delivery
                saved.delivery = {
                  ...rest,
                  pollAt: runtime.now() + POLL_MS,
                  ...(current?.slot ? { slot: true } : {}),
                  ...(current?.asked ? { asked: current.asked } : {}),
                  ...(current?.publishApproved ? { publishApproved: true } : {}),
                  ...(current?.mergeApproved ? { mergeApproved: true } : {}),
                  ...(current?.approvals ? { approvals: current.approvals } : {}),
                }
                if (waits(saved.delivery)) park(saved)
                else saved.state = 'landing'
              }, context)
            const delivery = await advanceDelivery(source, previous, save, signal)
            if (delivery.stage === previous.stage && delivery.reason === previous.reason)
              await runtime.commit(async (tx) => {
                const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
                  (item) => item.id === id,
                )
                if (saved?.delivery) saved.delivery.pollAt = runtime.now() + POLL_MS
              }, context)
            if (delivery.stage !== previous.stage || delivery.reason !== previous.reason)
              await step(
                delivery.reason
                  ? `delivery blocked: ${delivery.reason}`
                  : `delivery: ${delivery.stage}`,
              )
            if (delivery.stage === 'merged') {
              await remote(
                source,
                signal,
                'fetch',
                '--no-tags',
                delivery.settings.remote,
                `refs/heads/${delivery.settings.base}`,
              )
              const sha = delivery.merged!
              if ((await git(source, 'rev-parse', `${sha}^{tree}`)) !== delivery.tree)
                throw new Error('GitHub merge tree differs from the verified candidate')
              await serializeSourceWrites(source, async () => {
                const current = await git(source, 'rev-parse', `refs/heads/${target}`)
                if (!(await contains(source, current, sha)))
                  throw new Error('Local target advanced outside the merged delivery')
                await fastForwardOnlyTargetBranch(source, target, current, sha)
              })
              return commitLandingOutcome(`merged as ${sha.slice(0, 7)} through ${delivery.url}.`, {
                outcome: 'landed',
                delivery,
                sha,
                base: delivery.baseline,
                commits: lines(
                  await git(source, 'log', '--oneline', `${delivery.baseline}..${sha}`),
                ),
                paths: lines(await git(source, 'diff', '--name-only', delivery.baseline, sha)),
                flaky: [],
                pushed: `${delivery.settings.remote}/${target}`,
                pr: delivery.url,
              })
            }
            if (delivery.stage === 'blocked' && delivery.cause === 'stale')
              return await rebuild(delivery)
            if (delivery.stage === 'blocked') await reportBlocked(host, Workspaces, id, context)
            return next()
          }
          const verification = settings.delivery
            ? await runtime.memo(
                `verification-runtime:${id}:${round}`,
                { runtime: deliveryRuntime() },
                context,
              )
            : undefined
          if (verification && verification.runtime !== deliveryRuntime())
            return fail('verification runtime changed; submit again')
          const landingFromEarlierTask = entry.landed
          if (
            landingFromEarlierTask &&
            attempt === 1 &&
            !pushRetried &&
            (await contains(source, landingFromEarlierTask.sha, `refs/heads/${target}`))
          )
            return await landedReport(settings, landingFromEarlierTask, landingFromEarlierTask.sha)
          let checkedIntegration = await runtime.memo<CheckedIntegration>(
            `prepared:${id}:${round}`,
            context,
          )
          if (!checkedIntegration) {
            let mergedBeforeChecks = await runtime.memo<{ base: string; sha: string }>(
              `merged:${id}:${round}`,
              context,
            )
            const path = await resetTrackedIntegration(
              source,
              mergedBeforeChecks?.sha ?? (await git(source, 'rev-parse', `refs/heads/${target}`)),
            )
            if (!mergedBeforeChecks) {
              await step('preparing')
              const base = await git(path, 'rev-parse', 'HEAD')
              const mergeOrReportConflict = async (
                commit: string,
                message: string,
                reason: string,
                hint: string,
              ) => {
                try {
                  await git(path, 'merge', '--no-edit', '-m', message, commit)
                  return false
                } catch {
                  const conflicts = await git(path, 'diff', '--name-only', '--diff-filter=U')
                  await git(path, 'merge', '--abort').catch(overshadowed)
                  await fail(reason, conflicts, hint)
                  return true
                }
              }
              const fetchRemote = settings.delivery?.remote ?? settings.push
              if (fetchRemote) {
                if (await remote(path, signal, 'ls-remote', fetchRemote, `refs/heads/${target}`)) {
                  await remote(path, signal, 'fetch', '-q', fetchRemote, target)
                  const fetched = await git(path, 'rev-parse', 'FETCH_HEAD')
                  if (!(await contains(path, fetched, 'HEAD'))) {
                    await step(`merging ${settings.push}/${target}`)
                    if (
                      await mergeOrReportConflict(
                        fetched,
                        `Merge ${settings.push}/${target}`,
                        `${settings.push}/${target} conflicts with local ${target}`,
                        `Reconcile ${settings.push}/${target} with local ${target}, then submit again.`,
                      )
                    )
                      return
                  }
                }
              }
              await step('merging')
              if (
                await mergeOrReportConflict(
                  entry.tip,
                  `Merge ${entry.tip.slice(0, 7)} from #${entry.conversationId} into ${target}\n\nUltimate-Conversation: ${entry.conversationId}`,
                  `it conflicts with ${target} in`,
                  `Merge ${target} into your workspace, resolve, verify and submit again.`,
                )
              )
                return
              mergedBeforeChecks = await runtime.memo(
                `merged:${id}:${round}`,
                { base, sha: await git(path, 'rev-parse', 'HEAD') },
                context,
              )
            }
            const { base } = mergedBeforeChecks
            await step('setting up')
            await setup(
              source,
              path,
              await readWorktreeSetup(host.userHome, source, () => host.projectSettings()),
              signal,
            )
            const flaky: string[] = []
            for (const [position, group] of settings.checks.entries()) {
              const members = Array.isArray(group) ? group : [group]
              const commands = members.map((check) => check.command)
              const run = (command: string, member: number) =>
                runLanderCheck(
                  path,
                  command,
                  checkContext,
                  checkPids(host.home),
                  checkTemp(host.home),
                  limitsFor(members[member], limits),
                )
              const runCheckWithOneDurableRerun = async (command: string, member: number) => {
                const attemptMemoKey = `check:${id}:${round}:${Array.isArray(group) ? `${position}.${member}` : position}`
                const causeMemoKey = `${attemptMemoKey}:cause`
                let memoizedFirstRun =
                  (await runtime.memo<'passed' | 'failed'>(attemptMemoKey, context)) ??
                  ((await runtime.memo<string>(causeMemoKey, context)) ? 'failed' : undefined)
                if (!memoizedFirstRun) {
                  await step(`checking: ${command}`, { runs: command })
                  const began = performance.now()
                  const ran = await run(command, member)
                  const ms = performance.now() - began
                  const unmemoizedResult = ran.failure === undefined ? 'passed' : 'failed'
                  const logAttemptBeforeMemo = step
                  await logAttemptBeforeMemo(`checked: ${command}`, {
                    result: {
                      command,
                      result: unmemoizedResult,
                      ...(ran.summary ? { summary: ran.summary } : {}),
                    },
                    output: ran.failure,
                    ran: { ms, timedOut: ran.timedOut },
                  })
                  if (ran.failure !== undefined)
                    await runtime.memo(causeMemoKey, ran.cause, context)
                  memoizedFirstRun = await runtime.memo(attemptMemoKey, unmemoizedResult, context)
                }
                if (memoizedFirstRun === 'passed') return {}
                let rerun = await runtime.memo<{ failure?: string }>(
                  `${attemptMemoKey}:rerun`,
                  context,
                )
                if (!rerun) {
                  await step(`rerunning: ${command}`, { runs: command })
                  const began = performance.now()
                  const ran = await run(command, member)
                  const timing = { ms: performance.now() - began, timedOut: ran.timedOut }
                  if (ran.failure === undefined)
                    await step(`checked: ${command}`, {
                      result: {
                        command,
                        result: 'flaky',
                        ...(ran.summary ? { summary: ran.summary } : {}),
                      },
                      ran: timing,
                    })
                  else
                    await runtime.commit(async (tx) => {
                      await host.emit(tx, CheckRan, {
                        submission: id,
                        command,
                        result: ran.timedOut ? 'timeout' : 'failed',
                        ms: Math.round(timing.ms),
                      })
                    }, context)
                  rerun = await runtime.memo<{ failure?: string }>(
                    `${attemptMemoKey}:rerun`,
                    ran.failure === undefined ? {} : { failure: ran.failure },
                    context,
                  )
                }
                if (rerun.failure !== undefined) return { failure: rerun.failure }
                const cause = await runtime.memo<string>(causeMemoKey, context)
                return { flaky: cause ? `${command} · ${cause}` : command }
              }
              const settledCheckGroup = await Promise.allSettled(
                commands.map(runCheckWithOneDurableRerun),
              )
              const results = settledCheckGroup.map((outcome) => {
                if (outcome.status === 'rejected') throw outcome.reason
                return outcome.value
              })
              const failed = results.findIndex((result) => result.failure !== undefined)
              if (failed !== -1)
                return await fail(
                  `check failed twice: ${commands[failed]}`,
                  results[failed].failure,
                  'Fix it at its cause (a flaky test too: fix or delete it), verify and submit again.',
                )
              flaky.push(...results.flatMap((result) => result.flaky ?? []))
            }
            const checkedTreeChanged =
              (await git(path, 'rev-parse', 'HEAD')) !== mergedBeforeChecks.sha ||
              (await git(path, 'status', '--porcelain'))
            if (checkedTreeChanged)
              return await fail(
                'the integration checkout changed during checks',
                `${await git(path, 'log', '--oneline', '-3')}\n${await git(path, 'status', '--short')}`.trim(),
                'Submit again.',
              )
            checkedIntegration = await runtime.memo<CheckedIntegration>(
              `prepared:${id}:${round}`,
              {
                base,
                integrated: mergedBeforeChecks.sha,
                flaky,
                runtime: verification?.runtime ?? deliveryRuntime(),
                checkedAt: Date.now(),
              },
              context,
            )
          }
          const { base, integrated, flaky } = checkedIntegration
          if (settings.delivery) {
            if (checkedIntegration.runtime !== deliveryRuntime())
              throw new Error('Verification runtime changed; submit again')
            if (!entry.assessment)
              throw new Error('PR delivery requires risk and independent review evidence')
            if (settings.delivery.base !== target)
              throw new Error('Delivery base differs from workspace target')
            if (flaky.length)
              throw new Error(
                'PR delivery requires clean verification; fix flaky checks before publication',
              )
            const branch = `ultimate-delivery/${entry.id}${entry.rebuilds ? `-r${entry.rebuilds}` : ''}`
            const api = github(source, signal)
            const remoteBase = await api<{ commit: { sha: string } }>(
              `repos/${settings.delivery.repository}/branches/${encodeURIComponent(target)}`,
            )
            await git(source, 'merge-base', '--is-ancestor', remoteBase.commit.sha, integrated)
            const tree = await git(source, 'rev-parse', `${integrated}^{tree}`)
            const facts = {
              ...(entry.subject ? { subject: entry.subject } : {}),
              divergence: entry.divergence,
              candidate: integrated,
              tree,
              baseline: remoteBase.commit.sha,
              commits: lines(await git(source, 'log', '--oneline', `${base}..${integrated}`)),
              paths: lines(await git(source, 'diff', '--name-only', base, integrated)),
              checks: entry.steps.flatMap((s) =>
                s.check?.result === 'passed' ? [{ command: s.check.command }] : [],
              ),
              runtime: checkedIntegration.runtime,
              conversationId: entry.conversationId,
              lander: runtime.conversationId,
              ...(entry.rebuilds ? { rebuild: entry.rebuilds } : {}),
            }
            const record: NonNullable<QueueEntry['delivery']> = {
              settings: settings.delivery,
              ...entry.assessment,
              baseline: remoteBase.commit.sha,
              candidate: integrated,
              tree,
              branch,
              facts,
              checkedAt: checkedIntegration.checkedAt,
              runtime: checkedIntegration.runtime,
              stage: entry.assessment.reviewedTree === tree ? 'publish' : 'review',
              since: Date.now(),
              ...(entry.approvals ? { approvals: entry.approvals } : {}),
            }
            await runtime.commit(async (tx) => {
              const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
                (item) => item.id === id,
              )!
              saved.delivery = record
              if (waits(record)) park(saved)
              else saved.state = 'landing'
            }, context)
            if (entry.assessment.reviewedTree !== tree) {
              await (
                await host.harness().conversation(entry.conversationId, context)
              )?.submit(
                {
                  type: 'input',
                  whenBusy: 'followUp',
                  requestId: `delivery-review:${id}:${tree}`,
                  content: `Integration changed the reviewed tree. Independently review ${remoteBase.commit.sha}..${integrated}, then resubmit this same tip with reviewedTree ${tree}, risk and review evidence. No publication occurred.`,
                  entry: {
                    kind: LanderReportEntry.kind,
                    data: {
                      id,
                      outcome: {
                        outcome: 'failed',
                        reason: 'Integration needs independent review before publication',
                        divergence: entry.divergence,
                      },
                    },
                  },
                },
                context,
              )
            }
            await step(
              entry.assessment.reviewedTree === tree
                ? 'delivery: publish'
                : `delivery: review ${integrated}`,
            )
            return next()
          }
          await step('fast-forwarding')
          let refused: string | undefined
          const moved = await serializeSourceWrites(source, async () => {
            const current = await git(source, 'rev-parse', `refs/heads/${target}`)
            const replayAfterFastForward = current === integrated
            if (replayAfterFastForward) return false
            if (current !== base) return true
            try {
              await fastForwardOnlyTargetBranch(source, target, base, integrated)
            } catch (error) {
              refused = failure(error)
            }
            return false
          })
          if (refused)
            return fail(
              `the checkout of ${target} refused the fast-forward to ${integrated.slice(0, 7)}`,
              refused,
            )
          if (moved) {
            if (attempt < maxTargetMoveAttempts) return retry()
            return fail(`${target} kept moving during ${maxTargetMoveAttempts} attempts.`)
          }
          const weight = await landingWeight(source, base, integrated)
          const firstFastForwardCandidate: Landed = {
            sha: integrated,
            base,
            commits: lines(await git(source, 'log', '--oneline', `${base}..${integrated}`)),
            paths: lines(await git(source, 'diff', '--name-only', base, integrated)),
            flaky,
            ...(weight ? { weight } : {}),
          }
          let landed = firstFastForwardCandidate
          await runtime.commit(async (tx) => {
            const draft = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
            const saved = draft.queue.find((item) => item.id === id)!
            saved.landed ??= firstFastForwardCandidate
            landed = copyJson(saved.landed) as Landed
            draft.items[String(entry.conversationId)].landed = integrated
          }, context)
          return await landedReport(settings, landed, integrated)
        } catch (error) {
          if (signal.aborted) throw error
          if (entry.delivery) {
            await runtime.commit(async (tx) => {
              const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
                (item) => item.id === id,
              )
              if (!saved?.delivery) return
              const current = saved.delivery
              saved.delivery = {
                ...current,
                stage: 'blocked',
                cause: 'github',
                resumeStage: current.stage === 'blocked' ? current.resumeStage : current.stage,
                reason: 'Delivery recovery failed; inspect the lander log',
              }
              park(saved)
            }, context)
            host.notice(`Delivery ${id} recovery failed: ${failure(error)}`)
            await reportBlocked(host, Workspaces, id, context)
            return next()
          }
          return fail('it failed', failure(error))
        }
      },
      report: async (task, runtime, context) => {
        const { id, conversationId, text, headline, outcome } = task.state.checkpoint
        const branch = conversationId
        const entry = { kind: LanderReportEntry.kind, data: { id, outcome } }
        const next = { status: 'running', checkpoint: { phase: 'next' } } as const
        if (outcome.outcome === 'failed') {
          await (
            await runtime.conversation(branch, context)
          )?.submit(
            {
              type: 'input',
              content: text,
              entry,
              whenBusy: 'followUp',
              requestId: `lander:${id}`,
            },
            context,
          )
          await runtime.commit(() => next, context)
          return
        }
        await (
          await host.harness().conversation(branch, context)
        )?.submit(
          {
            type: 'write',
            requestId: `lander:${id}`,
            entry: { ...entry, model: [{ role: 'user', content: text, timestamp: Date.now() }] },
          },
          context,
        )
        const starter = await after.starter(branch, context)
        await runtime.commit(async (tx) => {
          let concludedInThisCommit = false
          if (!(await after.working(tx, branch)))
            try {
              await after.conclude(tx, branch)
              concludedInThisCommit = true
            } catch (error) {
              host.notice(`Not concluding #${branch} after landing: ${String(error)}`)
            }
          if (concludedInThisCommit && starter !== undefined && starter !== branch)
            await after.reserveLanding(tx, branch, id)
          return {
            status: 'running',
            checkpoint: {
              phase: 'deliver',
              id,
              conversationId,
              headline,
              outcome,
              concluded: concludedInThisCommit,
              ...(starter !== undefined && starter !== branch ? { starter } : {}),
            },
          }
        }, context)
      },
      deliver: async (task, runtime, context) => {
        const {
          id,
          conversationId,
          headline,
          outcome,
          concluded: conclusionCommitted,
          starter,
        } = task.state.checkpoint
        const entry = { kind: LanderReportEntry.kind, data: { id, outcome } }
        const content = `${headline}\nDiverged: ${outcome.divergence}\n${conclusionCommitted ? `#${conversationId} is concluded.` : `#${conversationId} still has work under way; it reports when it stops.`}`
        try {
          const to =
            starter === undefined ? undefined : await runtime.conversation(starter, context)
          await runtime.commit(async (tx) => {
            if (to && conclusionCommitted)
              await after.submitLanding(
                tx,
                to,
                { type: 'input', content, entry, whenBusy: 'followUp', requestId: `lander:${id}` },
                conversationId,
                id,
              )
            else if (to)
              await to.submit(tx, {
                type: 'write',
                requestId: `lander:${id}`,
                entry: { ...entry, model: [{ role: 'user', content, timestamp: Date.now() }] },
              })
            else if (conclusionCommitted && starter !== undefined) await after.retireLanding(tx, id)
            return {
              status: 'running',
              checkpoint: conclusionCommitted
                ? { phase: 'release', conversationId }
                : { phase: 'next' },
            }
          }, context)
        } catch (error) {
          if (runtime.signal.aborted || !conclusionCommitted || starter === undefined) throw error
          await runtime.commit(async (tx) => {
            await after.retireLanding(tx, id)
            return {
              status: 'running',
              checkpoint: {
                phase: 'card-failed',
                error: error instanceof Error ? error.message : String(error),
              },
            }
          }, context)
        }
      },
      'card-failed': (task) => {
        throw new Error(task.state.checkpoint.error)
      },
      release: async (task, runtime, context) => {
        await after
          .release(task.state.checkpoint.conversationId, context)
          .catch((error: unknown) => {
            context.abortSignal?.throwIfAborted()
            host.notice(
              `Releasing #${task.state.checkpoint.conversationId} failed: ${String(error)}`,
            )
          })
        await runtime.commit(() => ({ status: 'running', checkpoint: { phase: 'next' } }), context)
      },
    },
    abort: (task, runtime, context) =>
      runtime.commit(async (tx) => {
        const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
        if (index.landers[task.input.source] === task.id) delete index.landers[task.input.source]
        for (const item of index.queue)
          if (item.source === task.input.source) {
            item.state = 'queued'
            delete item.step
          }
        const checkpoint = task.state.checkpoint
        if (
          checkpoint.phase === 'deliver' &&
          checkpoint.concluded &&
          checkpoint.starter !== undefined
        )
          await after.retireLanding(tx, checkpoint.id)
        return { status: 'terminal', outcome: { status: 'aborted' } }
      }, context),
  })
  return Lander
}
