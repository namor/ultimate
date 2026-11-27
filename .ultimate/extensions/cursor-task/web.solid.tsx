/** @jsxImportSource @solidjs/web */
import { Check, Copy, RefreshCw, Square } from '@lucide/solid'
import { createMemo, createSignal, Show } from 'solid-js'
import {
  Tool,
  ToolContent,
  ToolDiagnostics,
  ToolHeader,
  ToolSection,
} from '@/components/ai/tool.solid.tsx'
import type { ToolState } from '@/components/ai/tool.solid.tsx'
import { Markdown } from '@/components/markdown/markdown.solid.tsx'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  actionRef,
  api,
  defineWebExtension,
  shortenPath,
  useSystem,
  useToolDuration,
} from '@/sdk/solid'
import type { ToolCallView } from '@/sdk/solid'
import type { CursorJob } from './types.d.ts'

const getJob = actionRef<{ id: string }, CursorJob>('cursor-task', 'get')
const cancelJob = actionRef<{ id: string }, CursorJob>('cursor-task', 'cancel')

function PathRow(props: { label: string; path: string }) {
  const system = useSystem()
  const [copied, setCopied] = createSignal(false)
  const [error, setError] = createSignal(false)

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(props.path)
      setCopied(true)
      setError(false)
    } catch {
      setError(true)
    }
  }

  return (
    <div class="flex min-w-0 items-start gap-2">
      <span class="w-20 shrink-0 pt-1.5 text-muted-foreground">{props.label}</span>
      <code class="min-w-0 flex-1 truncate pt-1.5 text-foreground/80" title={props.path}>
        {shortenPath(props.path, { home: system()?.machine.home })}
      </code>
      <Button
        aria-label={
          copied() ? `${props.label} path copied` : `Copy ${props.label.toLowerCase()} path`
        }
        class="size-8 shrink-0"
        onClick={() => copyPath()}
        size="icon"
        title={error() ? 'Could not copy path' : copied() ? 'Copied' : 'Copy path'}
        variant="ghost"
      >
        <Show when={copied()} fallback={<Copy class="size-3.5" />}>
          <Check class="size-3.5" />
        </Show>
      </Button>
      <Show when={error()}>
        <span class="sr-only" role="alert">
          Could not copy path
        </span>
      </Show>
    </div>
  )
}

const labels = {
  starting: 'Starting',
  running: 'Working',
  complete: 'Complete',
  interrupted: 'Interrupted',
  failed: 'Failed',
} as const

function CursorTask(props: { call: ToolCallView }) {
  const [saved, setSaved] = createSignal<CursorJob>()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const job = createMemo(() => {
    const streamed = props.call.details as CursorJob | undefined
    const retained = saved()
    return retained?.id === streamed?.id && retained?.endedAt ? retained : streamed
  })
  const activeJob = () => job()?.status === 'starting' || job()?.status === 'running'
  const callEnded = () =>
    props.call.status === 'done' ||
    props.call.status === 'error' ||
    props.call.status === 'interrupted'
  const interrupted = () =>
    job()?.status === 'interrupted' ||
    (activeJob() && callEnded()) ||
    (!job() && props.call.status === 'interrupted')
  const state = (): ToolState =>
    interrupted()
      ? 'interrupted'
      : job()?.status === 'complete'
        ? 'done'
        : job()?.status === 'failed'
          ? 'error'
          : props.call.status
  const title = () => {
    const task = props.call.args.task
    return job()?.task ?? (typeof task === 'string' ? task : 'Preparing task')
  }
  const status = () => {
    const current = job()
    return interrupted()
      ? 'Interrupted'
      : current
        ? labels[current.status]
        : state() === 'error'
          ? 'Failed'
          : 'Starting'
  }
  const duration = useToolDuration(() => props.call)

  async function control(action: 'cancel' | 'get') {
    const current = job()
    if (!current) return
    setBusy(true)
    setError(undefined)
    try {
      setSaved(await api.action(action === 'cancel' ? cancelJob : getJob, { id: current.id }))
    } catch {
      setError(
        action === 'cancel'
          ? 'Could not confirm cancellation. Check the saved task before starting another.'
          : 'Could not refresh the saved task.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Tool defaultOpen data-cursor-task={job()?.id ?? props.call.id}>
      <ToolHeader
        action={
          activeJob() &&
          !interrupted() && (
            <Button disabled={busy()} onClick={() => control('cancel')} size="sm" variant="ghost">
              <Square class="size-3" />
              {busy() ? 'Stopping…' : 'Cancel'}
            </Button>
          )
        }
        meta={
          <>
            <span>{status()}</span>
            <Show when={duration()}>{(value) => <span>{value()}</span>}</Show>
          </>
        }
        name="Cursor task"
        state={state()}
        title={<span title={title()}>{title()}</span>}
      />
      <ToolContent>
        <ToolDiagnostics diagnostics={props.call.diagnostics} />
        <ToolSection>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <output>
              {job()?.activity ??
                (state() === 'error'
                  ? 'Task did not start'
                  : 'Starting an independent Cursor agent')}
            </output>
            <Show when={job()}>
              {(current) => (
                <span class="tabular-nums">
                  {current().nativeCalls} native{' '}
                  {current().nativeCalls === 1 ? 'action' : 'actions'}
                </span>
              )}
            </Show>
            <Show when={interrupted() && job()}>
              <Button
                class="ml-auto"
                disabled={busy()}
                onClick={() => control('get')}
                size="sm"
                variant="ghost"
              >
                <RefreshCw class="size-3" />
                Refresh result
              </Button>
            </Show>
          </div>
          <Show when={error() ?? job()?.error}>
            {(message) => (
              <p class="pt-1 font-sans text-[13px] text-error" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <Show when={!job() && props.call.status === 'error' && !props.call.diagnostics.length}>
            <p class="font-sans text-[13px] text-error">
              {props.call.output || 'Cursor could not start.'}
            </p>
          </Show>
        </ToolSection>
        <Show when={job()}>
          {(current) => (
            <>
              <ToolSection class="border-t border-border/60">
                <PathRow label="Worktree" path={current().worktree} />
                <PathRow label="Result" path={current().resultPath} />
                <PathRow label="Patch" path={current().patchPath} />
              </ToolSection>
              <Show when={current().diffStat}>
                {(stat) => (
                  <ToolSection class="border-t border-border/60" label="Changes to review">
                    <pre class="max-h-40 overflow-auto whitespace-pre-wrap text-foreground/80">
                      {stat()}
                    </pre>
                  </ToolSection>
                )}
              </Show>
              <Show when={current().summary}>
                {(summary) => (
                  <ToolSection class="border-t border-border/60" label="Result preview">
                    <div class="max-h-48 overflow-y-auto font-sans text-[13px] leading-relaxed">
                      <Markdown text={summary()} />
                    </div>
                    <p class="pt-2 text-[11px] text-muted-foreground">
                      {current().status === 'complete'
                        ? 'Full output is saved in the result file.'
                        : 'Saved output may be partial; see the result file.'}
                    </p>
                  </ToolSection>
                )}
              </Show>
              <Show when={interrupted() && !current().summary}>
                <ToolSection class="font-sans text-[13px] text-muted-foreground">
                  Inspect any saved output and working copy before starting another task. It will
                  not restart automatically.
                </ToolSection>
              </Show>
            </>
          )}
        </Show>
        <ToolSection class="border-t border-border/60 text-[11px] text-muted-foreground">
          Independent Cursor agent · normal user access · changes are not integrated
        </ToolSection>
      </ToolContent>
    </Tool>
  )
}

export default defineWebExtension({ tools: { cursor_task: CursorTask } })
