import type { ConversationId } from '@earendil-works/pi-durable'
import { cn } from 'cn'
import {
  CheckIcon,
  ChevronRightIcon,
  CircleDotIcon,
  GitMergeIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Tool, ToolContent, ToolHeader, ToolOutput, ToolSection } from '@/components/ai/tool'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { DeliveryAction, StandingAction } from './refs.ts'
import { deliveryAsk } from './ask.tsx'
import { CI_LIMIT_MS, MAX_RERUNS, waits } from './delivery.ts'
import type { Delivery } from './delivery.ts'
import type { StandingGrant } from './types.ts'
import {
  formatDuration,
  formatTime,
  api,
  formatTokens,
  plural,
  useConversation,
  useNow,
  useToolDuration,
  useTranscript,
  useUltimate,
} from '@/sdk'
import type { EntryRecord, ToolCallView } from '@/sdk'
import { useWorkspaceIndex } from './data.tsx'
import { LandingCard, Open, Subject } from './landing.tsx'
import type { LandingTone } from './landing.tsx'
import { inProgress, superseded, tookFor } from './steps.tsx'
import type { LanderEntry, LanderOutcome, LanderStep, SubmitResult } from './types.ts'
import type { ConversationSubject } from '../conversations/types.ts'
import { LanderLog } from './entries.ts'
import { LanderReportEntry } from './refs.ts'

const isStep = (data: LanderEntry): data is LanderEntry & LanderStep => data.step !== undefined
const isOutcome = (data: LanderEntry): data is LanderEntry & LanderOutcome =>
  data.outcome !== undefined

const short = (sha: string) => sha.slice(0, 7)
const time = (at: number) => formatTime(at, true)

function headline(outcome: LanderOutcome, target?: string) {
  if (outcome.outcome === 'failed') return `Not landed: ${outcome.reason ?? 'failed'}`
  const on = target ? ` on ${target}` : ''
  const landed = outcome.commits?.length
    ? `Landed ${short(outcome.sha!)}${on}`
    : `Nothing new to land${on}`
  if (outcome.pushed) return `${landed} · pushed to ${outcome.pushed}`
  return outcome.reason ? `${landed} · ${outcome.reason}` : `${landed} · not pushed`
}

function Weight({ weight }: { weight: NonNullable<LanderOutcome['weight']> }) {
  const { added, removed, tokens } = weight
  return (
    <p className="text-muted-foreground tabular-nums" title="Estimated as bytes ÷ 4">
      <span className="text-diff-add">+{added}</span>{' '}
      <span className="text-diff-del">−{removed}</span> lines ·{' '}
      <span className={tokens > 0 ? 'text-diff-add' : tokens < 0 ? 'text-diff-del' : ''}>
        {tokens > 0 ? '+' : tokens < 0 ? '−' : '±'}
        {formatTokens(Math.abs(tokens))}
      </span>{' '}
      tokens
    </p>
  )
}

function OutcomeBody({ outcome }: { outcome: LanderOutcome }) {
  return (
    <>
      {outcome.weight && outcome.commits?.length ? <Weight weight={outcome.weight} /> : null}
      {outcome.commits && outcome.commits.length > 0 && (
        <ul className="space-y-0.5">
          {outcome.commits.map((commit) => (
            <li className="truncate" key={commit} title={commit}>
              <span className="text-muted-foreground">{commit.split(' ')[0]}</span>{' '}
              {commit.slice(commit.indexOf(' ') + 1)}
            </li>
          ))}
        </ul>
      )}
      {outcome.flaky?.map((command) => (
        <p className="text-warning" key={command}>
          flaky: {command}
        </p>
      ))}
      {outcome.needsRestart && <p className="text-warning">Needs restart.</p>}
      {outcome.hint && <p className="text-muted-foreground">{outcome.hint}</p>}
      {outcome.output && <OutputTail output={outcome.output} />}
    </>
  )
}

function OutputTail({ output }: { output: string }) {
  return (
    <Collapsible className="group/tail">
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
        <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]/tail:rotate-90" />
        Output
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ToolOutput className="px-0" isError output={output} />
      </CollapsibleContent>
    </Collapsible>
  )
}

const toneOf = (outcome: LanderOutcome): LandingTone =>
  outcome.outcome === 'failed' ? 'failed' : outcome.reason ? 'pushFailed' : 'landed'

export function LanderReport({ entry }: { entry: EntryRecord }) {
  const legacyReportSubmitter = useConversation((conversation) => conversation.id)
  if (!LanderReportEntry.is(entry)) return null
  const { outcome } = entry.data
  const from = outcome.conversationId ?? legacyReportSubmitter
  if (from === undefined) return null
  return (
    <div data-lander-report={toneOf(outcome)}>
      <LandingCard
        card={entry.id}
        sha={outcome.commits?.length ? outcome.sha : undefined}
        submission={entry.data.id}
        from={from}
        sourceEntry={outcome.at}
        divergence={outcome.divergence}
        headline={headline(outcome, outcome.target)}
        subject={outcome.subject}
        tone={toneOf(outcome)}
      >
        <OutcomeBody outcome={outcome} />
        <Steps
          ended={outcome.outcome === 'failed' ? 'failed' : 'landed'}
          lander={outcome.lander}
          steps={outcome.steps ?? []}
        />
      </LandingCard>
    </div>
  )
}

function Line({
  icon,
  children,
  at,
  took,
  active,
}: {
  icon: ReactNode
  children: ReactNode
  at: number
  took?: ReactNode
  active?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 pl-4 font-mono text-[11px] leading-5',
        active ? 'text-brand' : 'text-muted-foreground',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {took && (
        <span className={cn('shrink-0 tabular-nums', !active && 'text-muted-foreground/60')}>
          {took}
        </span>
      )}
      <time className="shrink-0 text-muted-foreground/60">{time(at)}</time>
    </div>
  )
}

function Elapsed({ since }: { since: number }) {
  return formatDuration(Math.max(0, useNow(1000) - since))
}

function StepLine({
  row,
  took,
  active,
  done = true,
  failed,
}: {
  row: LanderStep
  took?: number
  active?: boolean
  done?: boolean
  failed?: boolean
}) {
  if (active)
    return (
      <Line
        active
        at={row.at}
        icon={<LoaderCircleIcon className="size-3 shrink-0 animate-spin" />}
        took={<Elapsed since={row.at} />}
      >
        <span>{row.step}</span>
      </Line>
    )
  const duration = took !== undefined && took >= 1000 ? formatDuration(took) : undefined
  if (row.check)
    return (
      <Line
        at={row.at}
        took={duration}
        icon={
          row.check.result === 'passed' ? (
            <CheckIcon className="size-3 shrink-0 text-success" />
          ) : row.check.result === 'flaky' ? (
            <TriangleAlertIcon className="size-3 shrink-0 text-warning" />
          ) : (
            <XIcon className="size-3 shrink-0 text-error" />
          )
        }
      >
        {row.check.command}
        {row.check.result !== 'passed' && ` · ${row.check.result}`}
        {row.check.summary && (
          <span className="text-muted-foreground/60"> · {row.check.summary}</span>
        )}
      </Line>
    )
  return (
    <Line
      at={row.at}
      icon={
        failed ? (
          <XIcon className="size-3 shrink-0 text-error" />
        ) : done ? (
          <CheckIcon className="size-3 shrink-0 text-success/70" />
        ) : (
          <CircleDotIcon className="size-3 shrink-0 text-muted-foreground/60" />
        )
      }
      took={duration}
    >
      {row.step}
    </Line>
  )
}

function Steps({
  steps,
  lander,
  open,
  onOpenChange,
  running,
  ended,
}: {
  steps: readonly LanderStep[]
  lander: ConversationId
  open?: boolean
  onOpenChange?: (open: boolean) => void
  running?: boolean
  ended?: 'landed' | 'failed'
}) {
  const { switchConversation } = useUltimate()
  const rows = steps.filter((row, index) => !superseded(row, steps.slice(index + 1)))
  return (
    <Collapsible className="group/steps" onOpenChange={onOpenChange} open={open}>
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground">
        <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]/steps:rotate-90" />
        {rows.length ? plural(rows.length, 'step') : 'Steps'}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        {rows.map((row, index) => (
          <StepLine
            active={running && inProgress(row, rows.slice(index + 1))}
            done={index < rows.length - 1 || ended === 'landed'}
            failed={ended === 'failed' && index === rows.length - 1}
            key={index}
            row={row}
            took={tookFor(row, index, rows, steps)}
          />
        ))}
        <button
          className="cursor-pointer pt-1 pl-4 font-mono text-[11px] text-muted-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => switchConversation(lander)}
          type="button"
        >
          full log in #{lander}
        </button>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function LanderLogEntry({ entry }: { entry: EntryRecord }) {
  const entries = useTranscript()
  const workspace = useWorkspaceIndex()
  if (!LanderLog.is(entry)) return null
  const data = entry.data
  const queueReportsLanding = workspace.queue.some(
    (item) => item.id === data.submission && item.state === 'landing',
  )
  const own = entries
    .filter((candidate) => LanderLog.is(candidate))
    .filter((other) => other.data.submission === data.submission)
  const after = own.filter((other) => other.id > entry.id)
  const afterSteps = after.map((other) => other.data).filter(isStep)
  if (isStep(data) && superseded(data, afterSteps)) return null
  const next = after[0]?.data
  const failed = next?.outcome === 'failed'
  const done = next !== undefined && !failed
  const landing = queueReportsLanding && isStep(data) && inProgress(data, afterSteps)
  const steps = own.map((other) => other.data).filter(isStep)
  const rows = steps.filter((row, index) => !superseded(row, steps.slice(index + 1)))
  const took = (row: LanderStep) => {
    const index = rows.findIndex((other) => other.at === row.at && other.step === row.step)
    return index < 0 ? undefined : tookFor(row, index, rows, steps)
  }
  if (isOutcome(data)) {
    const outcome = data
    return (
      <div data-lander-outcome={data.outcome}>
        <LandingCard
          card={entry.id}
          sha={outcome.commits?.length ? outcome.sha : undefined}
          submission={data.submission}
          sourceEntry={data.sourceEntry}
          divergence={data.divergence}
          at={
            <time className="shrink-0 text-[11px] text-muted-foreground/60">{time(data.at)}</time>
          }
          from={data.conversationId}
          headline={headline(outcome, data.target)}
          subject={data.subject}
          tone={toneOf(outcome)}
        >
          <OutcomeBody outcome={outcome} />
        </LandingCard>
      </div>
    )
  }
  if (!isStep(data)) return null
  const queuedLineWaitsForStartedGroup = data.step === 'queued'
  if (queuedLineWaitsForStartedGroup) return null
  if (data.step === 'started') {
    const queued = steps.find((other) => other.step === 'queued')
    return (
      <div className="space-y-0.5 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2 font-mono text-[12px]">
          <GitMergeIcon className="size-3.5 shrink-0 text-brand" />
          <Subject from={data.conversationId} subject={data.subject} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {short(data.tip)} → {data.target}
          </span>
          <Open id={data.conversationId} />
        </div>
        {queued && <StepLine row={queued} took={took(queued)} />}
        <StepLine active={landing} done={done} failed={failed} row={data} took={took(data)} />
      </div>
    )
  }
  const line = (
    <StepLine active={landing} done={done} failed={failed} row={data} took={took(data)} />
  )
  if (!data.output) return line
  return (
    <div className="font-mono text-[11px]">
      {line}
      <div className="pl-9">
        <OutputTail output={data.output} />
      </div>
    </div>
  )
}

type Submission = {
  delivery?: Delivery
  conversationId?: ConversationId
  subject?: ConversationSubject
  tip: string
  target: string
  steps: readonly LanderStep[]
  position?: number
  step?: string
  landing?: boolean
  outcome?: LanderOutcome
}
function useSubmission(id: string | undefined): Submission | undefined {
  const index = useWorkspaceIndex()
  if (!id) return undefined
  const queued = index.queue.find((item) => item.id === id)
  if (queued)
    return {
      ...queued,
      landing: queued.state === 'landing',
      position: index.queue.filter((item) => item.source === queued.source).indexOf(queued) + 1,
    }
  const outcome = index.results[id]
  return outcome && { ...outcome, outcome }
}

const parse = (output: string) => {
  try {
    return JSON.parse(output) as unknown
  } catch {
    return undefined
  }
}

function StatusChip({ state }: { state: Submission }) {
  const chip = 'flex min-w-0 items-center gap-1 truncate'
  if (!state.outcome) {
    const wait = state.delivery && waits(state.delivery)
    if (wait)
      return (
        <span className={cn(chip, 'text-warning')}>
          {wait.on === 'user'
            ? 'Needs you'
            : wait.on === 'repair'
              ? 'Branch repairing'
              : wait.on === 'review'
                ? 'Awaiting independent review'
                : 'Awaiting your approval'}
        </span>
      )
    if (state.delivery && !state.landing)
      return <span className={cn(chip, 'text-brand')}>{stageLabel(state.delivery)}</span>
    if (state.landing)
      return (
        <span className={cn(chip, 'text-brand')}>
          <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
          <span className="truncate">{state.step ?? 'landing'}</span>
          {state.steps.at(-1) && (
            <span className="shrink-0 text-brand/70 tabular-nums">
              <Elapsed since={state.steps.at(-1)!.at} />
            </span>
          )}
        </span>
      )
    return <span className={chip}>queued #{state.position}</span>
  }
  const { outcome } = state
  if (outcome.outcome === 'failed')
    return <span className={cn(chip, 'text-error')}>Not landed</span>
  const landed = outcome.commits?.length ? `Landed ${short(outcome.sha!)}` : 'Nothing new'
  if (outcome.reason)
    return <span className={cn(chip, 'text-warning')}>{landed} · push failed</span>
  return (
    <span className={cn(chip, 'text-success')}>
      {landed}
      {outcome.pushed ? ' · pushed' : ''}
    </span>
  )
}

function StandingLine({ grant }: { grant?: StandingGrant }) {
  const [error, setError] = useState<string>()
  if (!grant || grant.revokedAt !== undefined || Date.now() >= grant.until) return null
  const revoke = () =>
    api.action(StandingAction, { revoke: true }).catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : 'Could not revoke')
    })
  return (
    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <span>
        Standing approval until{' '}
        {new Date(grant.until).toLocaleString([], {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })}
      </span>
      <Open id={grant.conversation} entry={grant.instruction} />
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void revoke()}>
        Revoke
      </Button>
      {error && <span className="text-error">{error}</span>}
    </p>
  )
}

const stageLabel = (delivery: Delivery) =>
  delivery.stage === 'pr'
    ? 'Opening the pull request'
    : delivery.stage === 'ci'
      ? 'Waiting for GitHub checks'
      : delivery.stage === 'merge'
        ? 'Merging'
        : delivery.stage === 'merged'
          ? 'Merged; advancing local target'
          : delivery.stage === 'publish'
            ? 'Publishing'
            : delivery.stage

function Waits({ delivery }: { delivery: Delivery }) {
  const wait = waits(delivery)
  const since = delivery.since ?? delivery.checkedAt
  const line = wait
    ? wait.on === 'user'
      ? `Needs you: ${wait.why}.`
      : wait.on === 'repair'
        ? 'Its branch was asked to diagnose and repair it; recheck, stop or a resubmission clears it.'
        : wait.on === 'review'
          ? 'Waits on an independent review of the integration tree; the branch resubmits with reviewedTree.'
          : `Waits on your ${wait.on} approval (or @ultimate under a standing approval).`
    : delivery.stage === 'ci'
      ? `Waits on GitHub; the lander rechecks every 30 s and reruns a check that never finishes after ${Math.round(CI_LIMIT_MS / 60000)} min (${delivery.reruns ?? 0}/${MAX_RERUNS} reruns used).`
      : 'The lander moves it on its next turn.'
  return (
    <p className="text-xs text-muted-foreground">
      {line} In this state for <Elapsed since={since} />.
    </p>
  )
}

function DeliveryCard({ id, delivery }: { id: string; delivery: Delivery }) {
  const { standing } = useWorkspaceIndex()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const ask = deliveryAsk(delivery)
  const action = ask ?? (delivery.stage === 'blocked' ? 'recheck' : undefined)
  const approve = async (
    request: 'publish' | 'merge' | 'recheck' | 'stop' | undefined = action,
  ) => {
    if (!request) return
    setPending(true)
    setError(undefined)
    try {
      await api.action(DeliveryAction, {
        id,
        candidate: delivery.candidate,
        tree: delivery.tree,
        action: request,
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update delivery')
    } finally {
      setPending(false)
    }
  }
  return (
    <section
      className={cn(
        'space-y-2 rounded-lg border p-3 text-sm',
        ask
          ? 'border-purple-500/40 border-l-2 border-l-purple-500 bg-purple-500/[0.07]'
          : 'border-border/70',
      )}
      aria-label="PR delivery"
      data-delivery-ask={ask}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className={cn(ask && 'text-purple-700 dark:text-purple-300')}>
          {action === 'recheck'
            ? 'Delivery needs attention'
            : delivery.stage === 'review'
              ? 'Independent review is needed'
              : action
                ? 'Your approval is needed'
                : 'PR delivery'}
        </strong>
        <span className="text-xs text-muted-foreground">{delivery.risk} risk</span>
      </div>
      <p className="break-words text-muted-foreground">
        {delivery.settings.repository} → {delivery.settings.base} ·{' '}
        <code title={delivery.candidate}>{short(delivery.candidate)}</code>
      </p>
      {delivery.stage === 'review' && (
        <p className="break-words text-muted-foreground">
          Review the integration candidate before publication. Tree: <code>{delivery.tree}</code>
        </p>
      )}
      {delivery.url && (
        <a
          className="text-brand underline underline-offset-4"
          href={delivery.url}
          target="_blank"
          rel="noreferrer"
        >
          Open pull request
        </a>
      )}
      {delivery.reason && <p className="text-warning">{delivery.reason}</p>}
      <Waits delivery={delivery} />
      {delivery.decisions?.length ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {plural(delivery.decisions.length, 'decision')}
          </summary>
          {delivery.decisions.map((decision) => (
            <p key={`${decision.at}:${decision.what}`}>
              {time(decision.at)} · {decision.what}
              {decision.why ? ` · ${decision.why}` : ''}
            </p>
          ))}
        </details>
      ) : null}
      <StandingLine grant={standing} />
      {delivery.approvals?.map((approval) => (
        <p
          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          key={`${approval.action}:${approval.at}`}
        >
          <span>
            {approval.action === 'publish'
              ? 'Publication approved'
              : approval.action === 'merge'
                ? 'Merge approved'
                : approval.action === 'recheck'
                  ? 'Recheck requested'
                  : 'Stopped'}{' '}
            {approval.by === 'user'
              ? 'by you'
              : approval.by === 'agent'
                ? `by #${approval.conversation}`
                : approval.standing !== undefined
                  ? 'by @ultimate under your standing approval'
                  : 'by @ultimate on your instruction'}{' '}
            · {time(approval.at)}
            {approval.reason && ` · ${approval.reason}`}
          </span>
          {approval.conversation !== undefined && (
            <Open id={approval.conversation} entry={approval.standing ?? approval.instruction} />
          )}
        </p>
      ))}
      {action && (
        <>
          <p>
            {action === 'publish'
              ? 'Allow this verified candidate to be published?'
              : action === 'merge'
                ? 'Required GitHub checks passed. Approve this candidate for merge?'
                : 'The existing delivery record will be reconciled. Uncertain writes are not blindly repeated.'}
          </p>
          <Button size="sm" disabled={pending} onClick={() => void approve()}>
            {pending
              ? 'Saving…'
              : action === 'publish'
                ? 'Approve publication'
                : action === 'merge'
                  ? 'Approve merge'
                  : 'Recheck outcome'}
          </Button>
          {(action === 'publish' || action === 'merge') && (
            <p className="text-xs text-purple-700 dark:text-purple-300">
              or tell @ultimate in its chat
            </p>
          )}
        </>
      )}
      {delivery.stage !== 'merged' &&
        !(delivery.createIntent && !delivery.pr) &&
        !delivery.mergeIntent && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => void approve('stop')}>
            {delivery.pr ? 'Stop delivery · close its PR' : 'Stop delivery'}
          </Button>
        )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </section>
  )
}

export function WorkspaceCall({ call }: { call: ToolCallView }) {
  const duration = useToolDuration(call)
  const action = typeof call.args.action === 'string' ? call.args.action : ''
  const result = call.status === 'done' ? parse(call.output) : undefined
  const submitted = action === 'submit' ? (result as SubmitResult | undefined) : undefined
  const state = useSubmission(submitted?.id)
  const [userOverrideOpen, setUserOverrideOpen] = useState<boolean>()
  return (
    <Tool defaultOpen={call.status === 'error'}>
      <ToolHeader
        meta={
          <>
            {state && <StatusChip state={state} />}
            {duration && !state && <span>{duration}</span>}
          </>
        }
        name="workspace"
        state={call.status}
        title={
          state ? (
            <>
              {action} · {short(state.tip)} → {state.target}
            </>
          ) : (
            action
          )
        }
      />
      {submitted && state && (
        <div className="space-y-1 border-t border-border/80 px-2.5 py-1.5">
          {state.delivery && !state.outcome && (
            <DeliveryCard id={submitted.id} delivery={state.delivery} />
          )}
          {state.subject && state.conversationId !== undefined && (
            <Subject from={state.conversationId} subject={state.subject} />
          )}
          <Steps
            lander={submitted.lander}
            onOpenChange={setUserOverrideOpen}
            open={userOverrideOpen ?? !state.outcome}
            ended={state.outcome?.outcome}
            running={state.landing}
            steps={state.steps}
          />
        </div>
      )}
      <ToolContent>
        {state?.outcome && (
          <ToolSection className="space-y-1.5" label="Lander">
            <OutcomeBody outcome={state.outcome} />
          </ToolSection>
        )}
        <ToolOutput
          isError={call.status === 'error'}
          output={submitted ? submitted.text : call.output}
        />
      </ToolContent>
    </Tool>
  )
}
