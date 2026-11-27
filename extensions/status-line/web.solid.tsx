import { createSignal, For, Show } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.solid.tsx'
import {
  defineWebExtension,
  formatTime,
  formatTokens,
  plural,
  useAction,
  useConversationId,
} from '@/sdk/solid'
import { MessageUsage } from './message-usage.solid.tsx'
import { Connection, Context, Cwd, GlobalUsage, Tokens } from './status.solid.tsx'
import { UsageAction } from './refs.ts'
import type { UsageFigures } from './refs.ts'

const counted = (value: number | null) => (value === null ? '?' : formatTokens(value))

function UsageValues(props: { value: UsageFigures }) {
  return (
    <span class="tabular-nums">
      ↑{counted(props.value.input)} ↓{counted(props.value.output)} R{counted(props.value.cacheRead)}{' '}
      W{counted(props.value.cacheWrite)} ${props.value.cost?.toFixed(3) ?? '?'}
    </span>
  )
}

function UsageReport(props: { id: number }) {
  const { data, error, loading, refetch } = useAction(UsageAction, {
    get conversation() {
      return props.id
    },
  })
  const buckets = () =>
    (['models', 'tools'] as const).flatMap((kind) =>
      Object.entries(data()?.[kind] ?? {}).map(([name, value]) => ({ kind, name, value })),
    )
  return (
    <>
      <div class="mb-2 flex items-center justify-between gap-3">
        <span class="font-medium">#{props.id} and owned subagents</span>
        <Button
          aria-label="Refresh task usage"
          disabled={loading()}
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
        >
          {loading() ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <Show
        when={!error()}
        fallback={<p class="text-error">Usage unavailable. Refresh to retry.</p>}
      >
        <Show when={data()}>
          {(report) => (
            <>
              <UsageValues value={report().totals} />
              <p class="mt-1 text-muted-foreground">
                {plural(report().conversations.length, 'conversation')} · observed{' '}
                {formatTime(report().observedAt, true)} · ? unknown
              </p>
              <div class="my-3 space-y-2 border-y py-2">
                <For each={report().conversations} keyed={(row) => row.id}>
                  {(row) => (
                    <div class="flex flex-wrap justify-between gap-x-3 gap-y-1">
                      <span class="min-w-0 truncate" title={row().title}>
                        #{row().id}
                        {row().label ? ` · ${row().label}` : ''}
                      </span>
                      <UsageValues value={row().totals} />
                    </div>
                  )}
                </For>
              </div>
              <details>
                <summary>Model and tool buckets</summary>
                <For each={buckets()} keyed={(bucket) => `${bucket.kind}/${bucket.name}`}>
                  {(bucket) => (
                    <div class="mt-2">
                      <div class="break-all text-muted-foreground">
                        {bucket().kind === 'tools' ? 'tool ' : ''}
                        {bucket().name}
                      </div>
                      <UsageValues value={bucket().value} />
                      <div class="text-muted-foreground">
                        Reasoning {counted(bucket().value.reasoning)} · 1h cache write{' '}
                        {counted(bucket().value.cacheWrite1h)}
                      </div>
                    </div>
                  )}
                </For>
              </details>
              <details class="mt-2 text-muted-foreground">
                <summary>Coverage and limits</summary>
                <For each={report().coverage}>{(line) => <p class="mt-2">{line}</p>}</For>
              </details>
            </>
          )}
        </Show>
      </Show>
    </>
  )
}

export function TaskUsage() {
  const id = useConversationId()
  const [open, setOpen] = createSignal(false)
  return (
    <Show when={id()}>
      <Popover open={open()} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Show usage for this conversation and its subagents"
          class="rounded-sm px-1 hover:bg-accent hover:text-foreground"
        >
          task usage
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Task usage report"
          side="top"
          class="max-h-[70vh] w-[34rem] max-w-[calc(100vw-1rem)] overflow-auto p-3 font-mono text-[11px]"
        >
          <Show when={open() && id()} keyed>
            {(current) => <UsageReport id={current} />}
          </Show>
        </PopoverContent>
      </Popover>
    </Show>
  )
}

export default defineWebExtension({
  messageDetails: [MessageUsage],
  slots: {
    'composer.status': [Cwd, Tokens, TaskUsage, Context],
    'statusline.left': [GlobalUsage],
    'statusline.right': [{ component: Connection, phone: true }],
  },
})
