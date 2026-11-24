import { createMemo, createSignal, For, Show } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { api, cn, plural, ROOT, useDocOf, useNow } from '@/sdk/solid'
import { deliveryAsk } from './ask.ts'
import { BRANCH_WAKES, CI_LIMIT_MS, MAX_RERUNS, waits } from './delivery.ts'
import type { Approval, Delivery } from './delivery.ts'
import { Open } from './landing.solid.tsx'
import { Elapsed, LogFold, short, time } from './log-parts.solid.tsx'
import { DeliveryAction, StandingAction, WorkspacesDoc } from './refs.ts'
import type { StandingGrant } from './types.ts'

const stageLabels = {
  review: 'Awaiting independent review',
  publish: 'Publishing',
  pr: 'Opening the pull request',
  ci: 'Waiting for GitHub checks',
  merge: 'Merging',
  merged: 'Merged; advancing local target',
  blocked: 'Delivery blocked',
}

const waitLabels = {
  user: 'Needs you',
  repair: 'Branch repairing',
  ultimate: '@ultimate deciding',
  review: 'Awaiting independent review',
  publish: 'Awaiting your approval',
  merge: 'Awaiting your approval',
}

export function deliveryStatus(delivery: Delivery | undefined, landing: boolean | undefined) {
  if (!delivery) return undefined
  const wait = waits(delivery)
  return wait
    ? { label: waitLabels[wait.on], color: 'text-warning' }
    : landing
      ? undefined
      : { label: stageLabels[delivery.stage], color: 'text-brand' }
}

function waitLine(delivery: Delivery) {
  const wait = waits(delivery)
  switch (wait?.on) {
    case 'user':
      return `Needs you: ${wait.why}.`
    case 'repair':
      return 'Its branch was asked to diagnose and repair it; recheck, stop or a resubmission clears it.'
    case 'ultimate':
      return `Its branch had ${BRANCH_WAKES} repair attempts; @ultimate rechecks, stops or asks you.`
    case 'review':
      return 'Waits on an independent review of the integration tree; the branch resubmits with reviewedTree.'
    case 'publish':
    case 'merge':
      return `Waits on your ${wait.on} approval (or @ultimate under a standing approval).`
    case undefined:
      break
  }
  if (delivery.stage === 'ci')
    return `Waits on GitHub; the lander rechecks every 30 s and reruns a check that never finishes after ${Math.round(CI_LIMIT_MS / 60000)} min (${delivery.reruns ?? 0}/${MAX_RERUNS} reruns used).`
  if (delivery.stage === 'publish' && !delivery.slot)
    return `Verified; publishes once ${delivery.settings.repository} has no other delivery PR in flight.`
  return 'The lander moves it on its next turn.'
}

function StandingLine(props: { grant: StandingGrant; context: string }) {
  const [error, setError] = createSignal<string>()
  return (
    <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <span>
        Standing approval until{' '}
        {new Date(props.grant.until).toLocaleString([], {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })}
      </span>
      <Open
        context={`standing approval for ${props.context}`}
        id={props.grant.conversation}
        entry={props.grant.instruction}
      />
      <Button
        aria-label={`Revoke standing approval from ${props.context}`}
        class="h-6 px-2 text-xs"
        data-agent-confirm="Revokes your standing delivery approval."
        onClick={() => {
          setError(undefined)
          return api.action(StandingAction, { revoke: true }).catch((failure: unknown) => {
            setError(failure instanceof Error ? failure.message : 'Could not revoke')
          })
        }}
        size="sm"
        variant="ghost"
      >
        Revoke
      </Button>
      <Show when={error()}>
        {(message) => (
          <span role="alert" class="text-error">
            {message()}
          </span>
        )}
      </Show>
    </div>
  )
}

const actions = {
  publish: {
    label: 'Approve publication',
    prompt: 'Allow this verified candidate to be published?',
  },
  merge: {
    label: 'Approve merge',
    prompt: 'Required GitHub checks passed. Approve this candidate for merge?',
  },
  recheck: {
    label: 'Recheck outcome',
    prompt:
      'The existing delivery record will be reconciled. Uncertain writes are not blindly repeated.',
  },
}

const approvalLabels = {
  publish: 'Publication approved',
  merge: 'Merge approved',
  recheck: 'Recheck requested',
  stop: 'Stopped',
}

export function DeliveryCard(props: { id: string; delivery: Delivery; context: string }) {
  const index = useDocOf(() => ROOT, WorkspacesDoc)
  const now = useNow(1000)
  const standing = createMemo(() => {
    const grant = index()?.standing
    return grant && grant.revokedAt === undefined && now() < grant.until ? grant : undefined
  })
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const delivery = () => props.delivery
  const ask = () => deliveryAsk(delivery(), standing(), now())
  const action = (): keyof typeof actions | undefined =>
    ask() ?? (delivery().stage === 'blocked' ? 'recheck' : undefined)
  const stopLabel = () => (delivery().pr ? 'Stop delivery · close its PR' : 'Stop delivery')
  const approve = async (request: Approval['action']) => {
    setPending(true)
    setError(undefined)
    try {
      const { candidate, tree } = delivery()
      await api.action(DeliveryAction, { id: props.id, candidate, tree, action: request })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update delivery')
    } finally {
      setPending(false)
    }
  }
  return (
    <section
      class={cn(
        'space-y-2 rounded-lg border p-3 text-sm',
        ask() ? 'border-brand/40 border-l-2 border-l-brand bg-brand/5' : 'border-border/70',
      )}
      aria-label={`PR delivery for ${props.context}`}
      data-delivery-ask={ask()}
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <strong class={cn(ask() && 'text-brand')}>
          {action() === 'recheck'
            ? 'Delivery needs attention'
            : delivery().stage === 'review'
              ? 'Independent review is needed'
              : action()
                ? 'Your approval is needed'
                : 'PR delivery'}
        </strong>
        <span class="text-xs text-muted-foreground">{delivery().risk} risk</span>
      </div>
      <p class="break-words text-muted-foreground">
        {delivery().settings.repository} → {delivery().settings.base} ·{' '}
        <code title={delivery().candidate}>{short(delivery().candidate)}</code>
      </p>
      <Show when={delivery().stage === 'review'}>
        <p class="break-words text-muted-foreground">
          Review the integration candidate before publication. Tree: <code>{delivery().tree}</code>
        </p>
      </Show>
      <Show when={delivery().url}>
        {(url) => (
          <a
            class="text-brand underline underline-offset-4"
            href={url()}
            target="_blank"
            rel="noreferrer"
          >
            Open pull request
          </a>
        )}
      </Show>
      <Show when={delivery().reason}>{(reason) => <p class="text-warning">{reason()}</p>}</Show>
      <p class="text-xs text-muted-foreground">
        {waitLine(delivery())} In this state for{' '}
        <Elapsed since={delivery().since ?? delivery().checkedAt} />.
      </p>
      <Show when={delivery().decisions?.length}>
        {(count) => (
          <LogFold
            class="text-xs"
            label={`Delivery decisions for ${props.context}`}
            title={plural(count(), 'decision')}
          >
            <For each={delivery().decisions}>
              {(decision) => (
                <p class="text-xs text-muted-foreground">
                  {time(decision.at)} · {decision.what}
                  {decision.why ? ` · ${decision.why}` : ''}
                </p>
              )}
            </For>
          </LogFold>
        )}
      </Show>
      <Show when={standing()}>
        {(grant) => <StandingLine context={props.context} grant={grant()} />}
      </Show>
      <For each={delivery().approvals}>
        {(approval) => (
          <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>
              {approvalLabels[approval.action]}{' '}
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
            <Show when={approval.conversation}>
              {(id) => (
                <Open
                  context={`${approval.action} decision for ${props.context}`}
                  id={id()}
                  entry={approval.standing ?? approval.instruction}
                />
              )}
            </Show>
          </div>
        )}
      </For>
      <Show when={action()}>
        {(request) => (
          <>
            <p>{actions[request()].prompt}</p>
            <Button
              aria-label={`${actions[request()].label} for ${props.context}`}
              data-agent-confirm={actions[request()].prompt}
              disabled={pending()}
              onClick={() => approve(request())}
              size="sm"
            >
              {pending() ? 'Saving…' : actions[request()].label}
            </Button>
            <Show when={request() !== 'recheck'}>
              <p class="text-xs text-brand">or tell @ultimate in its chat</p>
            </Show>
          </>
        )}
      </Show>
      <Show
        when={
          delivery().stage !== 'merged' &&
          !(delivery().createIntent && !delivery().pr) &&
          !delivery().mergeIntent
        }
      >
        <Button
          aria-label={`${stopLabel()} for ${props.context}`}
          data-agent-confirm={stopLabel()}
          disabled={pending()}
          onClick={() => approve('stop')}
          size="sm"
          variant="ghost"
        >
          {stopLabel()}
        </Button>
      </Show>
      <Show when={error()}>
        {(message) => (
          <p role="alert" class="text-error">
            {message()}
          </p>
        )}
      </Show>
    </section>
  )
}
