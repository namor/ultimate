import { MessageCircleQuestion } from '@lucide/solid'
import { createMemo, Show } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { events, getState, ROOT, showSurface, switchConversation, useDocOf } from '@/sdk/solid'
import { MessagesDoc, type MessagesData } from '../messages/refs.ts'
import { WorkspacesDoc } from '../workspaces/refs.ts'
import type { WorkspaceIndex } from '../workspaces/types.ts'
import { deliveryAsk } from '../workspaces/ui.solid.tsx'
import { asks, type Ask } from './open.ts'

function openAsk(ask: Ask) {
  const { conversation } = ask
  events.emit(
    'messages:open',
    'message' in ask ? { conversation, message: ask.message } : { conversation, entry: ask.entry },
  )
  showSurface('agent')
  switchConversation(conversation)
}

function asksOf(
  messages: MessagesData | null | undefined,
  workspaces: WorkspaceIndex | null | undefined,
) {
  return asks(
    messages?.messages ?? [],
    (workspaces?.queue ?? []).flatMap((entry) =>
      deliveryAsk(entry.delivery, workspaces?.standing)
        ? [{ conversation: entry.conversationId, entry: entry.at, at: entry.steps[0]?.at ?? 0 }]
        : [],
    ),
  )
}

export function oldestAsk() {
  const docs = getState().docsOf[ROOT]
  return asksOf(
    docs?.[MessagesDoc.kind] as MessagesData | null | undefined,
    docs?.[WorkspacesDoc.kind] as WorkspaceIndex | null | undefined,
  )[0]
}

export function openOldestAsk() {
  const ask = oldestAsk()
  if (ask) openAsk(ask)
}

export function WaitingPill() {
  const messages = useDocOf(() => ROOT, MessagesDoc)
  const workspaces = useDocOf(() => ROOT, WorkspacesDoc)
  const count = createMemo(() => asksOf(messages(), workspaces()).length)
  const label = () => `${count()} waiting on you`
  return (
    <>
      <span aria-live="polite" class="sr-only">
        {count() ? label() : ''}
      </span>
      <Show when={count() > 0}>
        <Button
          aria-label={`${label()}: open the oldest`}
          class="h-6 gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 px-2 font-mono text-[11px] font-normal text-purple-700 hover:bg-purple-500/20 focus-visible:ring-purple-500/60 max-md:h-7 dark:text-purple-300"
          data-waiting-pill={count()}
          onClick={openOldestAsk}
          size={null}
          title="Open the oldest one waiting on you"
          variant={null}
        >
          <MessageCircleQuestion class="size-3.5" />
          <span>
            {count()}
            <span class="max-md:hidden"> waiting</span>
          </span>
        </Button>
      </Show>
    </>
  )
}
