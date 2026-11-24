import { GitMerge } from '@lucide/solid'
import type { JSX } from '@solidjs/web'
import type { ConversationId } from '@earendil-works/pi-durable'
import { createMemo, Show } from 'solid-js'
import { cn, column, ROOT, useConversationId, useDocOf, useSystem } from '@/sdk/solid'
import type { SolidComposerProps } from '@/sdk/solid'
import { WorkspacesDoc } from './refs.ts'

function useLanderSource(id: () => ConversationId | undefined) {
  const index = useDocOf(() => ROOT, WorkspacesDoc)
  return createMemo(() => {
    const shown = id()
    if (shown === undefined) return undefined
    return Object.entries(index()?.landerConversations ?? {}).find(
      ([, lander]) => lander === shown,
    )?.[0]
  })
}

export function LanderComposer(props: SolidComposerProps) {
  const id = useConversationId()
  const index = useDocOf(() => ROOT, WorkspacesDoc)
  const system = useSystem()
  const source = useLanderSource(id)
  const queue = createMemo(() => index()?.queue.filter((item) => item.source === source()) ?? [])
  const landing = () => queue().some((item) => item.state === 'landing')
  const waiting = () => queue().some((item) => item.state === 'waiting')
  const queued = () => queue().filter((item) => item.state === 'queued').length
  return (
    <Show when={source()} fallback={props.core}>
      {(path) => (
        <div class={cn(column(props.dock), 'pb-3')}>
          <div
            class="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-3.5 py-2.5 text-[12.5px] text-muted-foreground"
            data-lander-log={id()}
          >
            <GitMerge class="mt-0.5 size-4 shrink-0 text-brand" />
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span class="min-w-0 font-medium break-words text-foreground">
                  {path() === system()?.project.root
                    ? 'Project checkout'
                    : path().split('/').filter(Boolean).at(-1) || path()}
                </span>
                <span class={landing() ? 'text-brand' : undefined}>
                  {landing() ? 'Landing' : waiting() ? 'Waiting on delivery' : 'Idle'}
                  {queued() > 0 ? ` · ${queued()} queued` : ''}
                </span>
              </div>
              <p class="font-mono text-[11px] break-all select-text">{path()}</p>
              <p>
                One landing log per source checkout. The lander runs code, not a model; outcomes go
                back to each submitting branch.
              </p>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}

export function EmptyLander(props: { conversation: ConversationId; core: JSX.Element }) {
  const source = useLanderSource(() => props.conversation)
  return (
    <Show when={source()} fallback={props.core}>
      <div
        class="flex size-full min-h-[55vh] flex-col items-center justify-center p-8 text-center"
        data-ui="empty-state"
      >
        <GitMerge class="mb-3 size-5 text-brand" />
        <h2 class="text-[14px] font-medium text-foreground">No landings yet</h2>
        <p class="mt-1 max-w-sm text-[13px] text-muted-foreground">
          Submissions for this checkout will appear here with their checks and outcomes.
        </p>
      </div>
    </Show>
  )
}
