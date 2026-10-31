import { CheckIcon, CopyIcon, RefreshCwIcon, SquareIcon } from 'lucide-react'
import React, { useState } from 'react'
import { MessageResponse } from '@/components/ai/message'
import { Tool, ToolContent, ToolDiagnostics, ToolHeader, ToolSection } from '@/components/ai/tool'
import type { ToolState } from '@/components/ai/tool'
import { Button } from '@/components/ui/button'
import { actionRef, api, defineWebExtension, shortenPath, useSystem, useToolDuration } from '@/sdk'
import type { ToolCallView } from '@/sdk'
import type { CursorJob } from './types.d.ts'

const getJob = actionRef<{ id: string }, CursorJob>('cursor-task', 'get')
const cancelJob = actionRef<{ id: string }, CursorJob>('cursor-task', 'cancel')

function PathRow({ label, path }: { label: string; path: string }) {
  const system = useSystem()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="w-20 shrink-0 pt-1.5 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate pt-1.5 text-foreground/80" title={path}>
        {shortenPath(path, { home: system?.machine.home })}
      </code>
      <Button
        aria-label={copied ? `${label} path copied` : `Copy ${label.toLowerCase()} path`}
        className="size-8 shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(path)
            setCopied(true)
            setError(false)
          } catch {
            setError(true)
          }
        }}
        size="icon"
        title={error ? 'Could not copy path' : copied ? 'Copied' : 'Copy path'}
        variant="ghost"
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </Button>
      {error && (
        <span className="sr-only" role="alert">
          Could not copy path
        </span>
      )}
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

function CursorTask({ call }: { call: ToolCallView }) {
  const streamed = call.details as CursorJob | undefined
  const [saved, setSaved] = useState<CursorJob>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const job = saved?.id === streamed?.id && saved?.endedAt ? saved : streamed
  const activeJob = job?.status === 'starting' || job?.status === 'running'
  const callEnded =
    call.status === 'done' || call.status === 'error' || call.status === 'interrupted'
  const interrupted =
    job?.status === 'interrupted' ||
    (activeJob && callEnded) ||
    (!job && call.status === 'interrupted')
  const running = activeJob && !interrupted
  const state: ToolState = interrupted
    ? 'interrupted'
    : job?.status === 'complete'
      ? 'done'
      : job?.status === 'failed'
        ? 'error'
        : call.status
  const title =
    job?.task ?? (typeof call.args.task === 'string' ? call.args.task : 'Preparing task')
  const status = interrupted
    ? 'Interrupted'
    : job
      ? labels[job.status]
      : state === 'error'
        ? 'Failed'
        : 'Starting'
  const duration = useToolDuration(call)
  async function control(action: 'cancel' | 'get') {
    if (!job) return
    setBusy(true)
    setError(undefined)
    try {
      setSaved(await api.action(action === 'cancel' ? cancelJob : getJob, { id: job.id }))
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
    <Tool defaultOpen data-cursor-task={job?.id ?? call.id}>
      <ToolHeader
        action={
          running && (
            <Button disabled={busy} onClick={() => control('cancel')} size="sm" variant="ghost">
              <SquareIcon className="size-3" />
              {busy ? 'Stopping…' : 'Cancel'}
            </Button>
          )
        }
        meta={
          <>
            <span>{status}</span>
            {duration && <span>{duration}</span>}
          </>
        }
        name="Cursor task"
        state={state}
        title={<span title={title}>{title}</span>}
      />
      <ToolContent>
        <ToolDiagnostics diagnostics={call.diagnostics} />
        <ToolSection>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span role="status">
              {job?.activity ??
                (state === 'error' ? 'Task did not start' : 'Starting an independent Cursor agent')}
            </span>
            {job && (
              <span className="tabular-nums">
                {job.nativeCalls} native {job.nativeCalls === 1 ? 'action' : 'actions'}
              </span>
            )}
            {interrupted && job && (
              <Button
                className="ml-auto"
                disabled={busy}
                onClick={() => control('get')}
                size="sm"
                variant="ghost"
              >
                <RefreshCwIcon className="size-3" />
                Refresh result
              </Button>
            )}
          </div>
          {(job?.error || error) && (
            <p className="pt-1 font-sans text-[13px] text-error" role="alert">
              {error ?? job?.error}
            </p>
          )}
          {!job && call.status === 'error' && !call.diagnostics.length && (
            <p className="font-sans text-[13px] text-error">
              {call.output || 'Cursor could not start.'}
            </p>
          )}
        </ToolSection>
        {job && (
          <>
            <ToolSection className="border-t border-border/60">
              <PathRow label="Worktree" path={job.worktree} />
              <PathRow label="Result" path={job.resultPath} />
              <PathRow label="Patch" path={job.patchPath} />
            </ToolSection>
            {job.diffStat && (
              <ToolSection className="border-t border-border/60" label="Changes to review">
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-foreground/80">
                  {job.diffStat}
                </pre>
              </ToolSection>
            )}
            {job.summary && (
              <ToolSection className="border-t border-border/60" label="Result preview">
                <div className="max-h-48 overflow-y-auto font-sans text-[13px] leading-relaxed">
                  <MessageResponse>{job.summary}</MessageResponse>
                </div>
                <p className="pt-2 text-[11px] text-muted-foreground">
                  {job.status === 'complete'
                    ? 'Full output is saved in the result file.'
                    : 'Saved output may be partial; see the result file.'}
                </p>
              </ToolSection>
            )}
            {interrupted && !job.summary && (
              <ToolSection className="font-sans text-[13px] text-muted-foreground">
                Inspect any saved output and working copy before starting another task. It will not
                restart automatically.
              </ToolSection>
            )}
          </>
        )}
        <ToolSection className="border-t border-border/60 text-[11px] text-muted-foreground">
          Independent Cursor agent · normal user access · changes are not integrated
        </ToolSection>
      </ToolContent>
    </Tool>
  )
}

export default defineWebExtension({ tools: { cursor_task: CursorTask } })
