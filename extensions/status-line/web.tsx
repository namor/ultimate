import { useState } from 'react'
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  defineWebExtension,
  formatDuration,
  formatTime,
  formatTokens,
  island,
  useAction,
  useConversation,
  useModels,
  useTranscript,
} from '@/sdk'
import type { AssistantMessage, EntryRecord } from '@/sdk'
import { promptTokens as prompt } from '../../lib/context-usage.ts'
import { UsageAction } from './refs.ts'
import type { UsageFigures } from './refs.ts'
import { Connection, Context, Cwd, GlobalUsage, Tokens } from './status.solid.tsx'
import { responseAfter, turnOf } from './turns.ts'

function Item({ children, tip }: { children: ReactNode; tip: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-1.5">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-[11px]" side="top">
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}

const counted = (value: number | null) => (value === null ? '?' : formatTokens(value))

function UsageValues({ value }: { value: UsageFigures }) {
  return (
    <span className="tabular-nums">
      ↑{counted(value.input)} ↓{counted(value.output)} R{counted(value.cacheRead)} W
      {counted(value.cacheWrite)} ${value.cost === null ? '?' : value.cost.toFixed(3)}
    </span>
  )
}

function TaskUsage() {
  const { id } = useConversation()
  const [open, setOpen] = useState(false)
  const { data, error, loading, refetch } = useAction(
    UsageAction,
    { conversation: id },
    {
      enabled: open && id !== undefined,
    },
  )
  if (id === undefined) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-sm px-1 hover:bg-accent hover:text-foreground"
          aria-label="Show usage for this conversation and its subagents"
        >
          task usage
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="max-h-[70vh] w-[34rem] max-w-[calc(100vw-1rem)] overflow-auto p-3 font-mono text-[11px]"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="font-medium">#{id} and owned subagents</span>
          <button
            type="button"
            disabled={loading}
            className="rounded-sm px-1 hover:bg-accent disabled:opacity-50"
            onClick={refetch}
          >
            {loading ? 'Reading…' : 'Refresh'}
          </button>
        </div>
        {error ? (
          <p className="text-error">Usage unavailable. Refresh to retry.</p>
        ) : (
          data && (
            <>
              <UsageValues value={data.totals} />
              <p className="mt-1 text-muted-foreground">
                {data.conversations.length}{' '}
                {data.conversations.length === 1 ? 'conversation' : 'conversations'} · observed{' '}
                {formatTime(data.observedAt, true)} · ? unknown
              </p>
              <div className="my-3 space-y-2 border-y py-2">
                {data.conversations.map((row) => (
                  <div key={row.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate" title={row.title}>
                      #{row.id}
                      {row.label ? ` · ${row.label}` : ''}
                    </span>
                    <UsageValues value={row.totals} />
                  </div>
                ))}
              </div>
              <details>
                <summary className="cursor-pointer">Model and tool buckets</summary>
                {(['models', 'tools'] as const).flatMap((kind) =>
                  Object.entries(data[kind]).map(([name, value]) => (
                    <div key={`${kind}/${name}`} className="mt-2">
                      <div className="break-all text-muted-foreground">
                        {kind === 'tools' ? 'tool ' : ''}
                        {name}
                      </div>
                      <UsageValues value={value} />
                      <div className="text-muted-foreground">
                        Reasoning {counted(value.reasoning)} · 1h cache write{' '}
                        {counted(value.cacheWrite1h)}
                      </div>
                    </div>
                  )),
                )}
              </details>
              <details className="mt-2 text-muted-foreground">
                <summary className="cursor-pointer">Coverage and limits</summary>
                {data.coverage.map((line) => (
                  <p key={line} className="mt-2">
                    {line}
                  </p>
                ))}
              </details>
            </>
          )
        )}
      </PopoverContent>
    </Popover>
  )
}

const dollars = (cost: number) => `$${cost.toFixed(cost < 1 ? 3 : 2)}`

function MessageUsage({ entry }: { entry: EntryRecord }) {
  const entries = useTranscript()
  const models = useModels()
  const stored = entry.model?.[0]
  const input = stored?.role === 'user'
  const message: AssistantMessage | undefined =
    stored?.role === 'assistant' ? stored : input ? responseAfter(entries, entry) : undefined
  if (!message) return null
  const used = prompt(message.usage)
  if (used === 0) return null
  const window = models?.models.find(
    (model) => model.provider === message.provider && model.id === message.model,
  )?.contextWindow
  const context = window
    ? `${((used / window) * 100).toFixed(1)}% ctx`
    : `${formatTokens(used)} ctx`
  const contextTip = `${used.toLocaleString()}${window ? ` of ${window.toLocaleString()}` : ''} tokens`
  if (input) return <Item tip={<>Sent into a context of {contextTip}</>}>{context}</Item>
  const ended = message.stopReason !== 'toolUse'
  const turn = ended ? turnOf(entries, entry) : undefined
  const many = turn && turn.responses > 1 ? turn : undefined
  const end = message.timestamp + (message.durationMs ?? 0)
  const cost = many ? many.cost : message.usage.cost.total
  const parts = [
    ...(ended ? [message.model] : []),
    context,
    ...(many ? [`turn ${formatDuration(end - many.started)}`] : []),
    ...(cost > 0 ? [dollars(cost)] : []),
  ]
  return (
    <Item
      tip={
        <div className="grid grid-cols-[auto_auto] gap-x-3">
          <span>Response</span>
          <span>
            ↑{formatTokens(used)} ↓{formatTokens(message.usage.output)} ·{' '}
            {dollars(message.usage.cost.total)}
            {message.durationMs ? ` · ${formatDuration(message.durationMs)}` : ''}
          </span>
          {many && (
            <>
              <span>Turn</span>
              <span>
                {many.responses} responses · ↑{formatTokens(many.prompt)} ↓
                {formatTokens(many.output)} · {dollars(many.cost)} ·{' '}
                {formatDuration(end - many.started)}
              </span>
            </>
          )}
          <span>Context</span>
          <span>{contextTip}</span>
          <span>Model</span>
          <span>
            {message.provider}/{message.model}
            {(message.thinkingLevel ?? message.providerThinkingLevel) &&
              ` · ${message.thinkingLevel ?? message.providerThinkingLevel}`}
          </span>
        </div>
      }
    >
      <span className="truncate">{parts.join(' · ')}</span>
    </Item>
  )
}

export default defineWebExtension({
  messageDetails: [MessageUsage],
  slots: {
    'composer.status': [island(Cwd), island(Tokens), TaskUsage, island(Context)],
    'statusline.left': [island(GlobalUsage)],
    'statusline.right': [{ component: island(Connection), phone: true }],
  },
})
