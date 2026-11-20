import { MessageCircleQuestionIcon } from 'lucide-react'
import { events, getState, ROOT, useDocOf, useUltimate } from '@/sdk'
import type { UltimateContext } from '@/sdk'
import { MessagesDoc, emptyMessages } from '../messages/ui.tsx'
import type { MessagesData } from '../messages/refs.ts'
import { deliveryAsk, WorkspacesDoc } from '../workspaces/ui.tsx'
import type { WorkspaceIndex } from '../workspaces/types.ts'
import { asks } from './open.tsx'
import type { Ask } from './open.tsx'

export function openAsk(
  ask: Ask,
  ultimate: Pick<UltimateContext, 'showSurface' | 'switchConversation'>,
) {
  const { conversation } = ask
  events.emit(
    'messages:open',
    'message' in ask ? { conversation, message: ask.message } : { conversation, entry: ask.entry },
  )
  ultimate.showSurface('agent')
  ultimate.switchConversation(conversation)
}

const asksOf = (
  messages: MessagesData | null | undefined,
  workspaces: WorkspaceIndex | null | undefined,
) =>
  asks(
    (messages ?? emptyMessages).messages,
    (workspaces?.queue ?? []).flatMap((entry) =>
      deliveryAsk(entry.delivery)
        ? [{ conversation: entry.conversationId, entry: entry.at, at: entry.steps[0]?.at ?? 0 }]
        : [],
    ),
  )

export const useAsks = () => asksOf(useDocOf(ROOT, MessagesDoc), useDocOf(ROOT, WorkspacesDoc))

export const currentAsks = () => {
  const docs = getState().docsOf[ROOT]
  return asksOf(
    docs?.[MessagesDoc.kind] as MessagesData | null | undefined,
    docs?.[WorkspacesDoc.kind] as WorkspaceIndex | null | undefined,
  )
}

export function WaitingPill() {
  const waiting = useAsks()
  const ultimate = useUltimate()
  const count = waiting.length
  const label = `${count} waiting on you`
  return (
    <>
      <span aria-live="polite" className="sr-only">
        {count ? label : ''}
      </span>
      {count > 0 && (
        <button
          aria-label={`${label}: open the oldest`}
          className="flex h-6 cursor-pointer items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 px-2 font-mono text-[11px] text-purple-700 transition-colors outline-none hover:bg-purple-500/20 focus-visible:ring-2 focus-visible:ring-purple-500/60 max-md:h-7 dark:text-purple-300"
          data-waiting-pill={count}
          onClick={() => openAsk(waiting[0], ultimate)}
          title="Open the oldest one waiting on you"
          type="button"
        >
          <MessageCircleQuestionIcon className="size-3.5" />
          <span>
            {count}
            <span className="max-md:hidden"> waiting</span>
          </span>
        </button>
      )}
    </>
  )
}
