import { MessageCircleQuestionIcon } from 'lucide-react'
import { events, getState, useDocOf, useUltimate } from '@/sdk'
import { MessagesDoc, emptyMessages } from '../messages/ui.tsx'
import type { MessagesData } from '../messages/refs.ts'
import { deliveryAsk, WorkspacesDoc } from '../workspaces/ui.tsx'
import type { WorkspaceIndex } from '../workspaces/types.ts'
import { asks } from './open.tsx'
import type { Ask } from './open.tsx'

/**
 * Opens the asker's conversation at the card: `messages:open` checks a message still waits, and scrolls to it or to
 * the delivery's submitting call.
 */
export function openAsk(
  ask: Ask,
  ultimate: { showSurface: (id: string) => void; switchConversation: (id: number) => void },
) {
  const { conversation } = ask
  events.emit(
    'messages:open',
    'message' in ask ? { conversation, message: ask.message } : { conversation, entry: ask.entry },
  )
  ultimate.showSurface('agent')
  ultimate.switchConversation(conversation)
}

/** Everything waiting on the user, oldest first, from the root's Messages and Workspaces documents. */
const asksOf = (
  messages: MessagesData | null | undefined,
  workspaces: WorkspaceIndex | null | undefined,
) =>
  asks(
    (messages ?? emptyMessages).messages,
    (workspaces?.queue ?? []).flatMap((entry) =>
      deliveryAsk(entry.delivery)
        ? // `at` is the submitting entry; its first step is when it was queued.
          [{ conversation: entry.conversationId, entry: entry.at, at: entry.steps[0]?.at ?? 0 }]
        : [],
    ),
  )

export const useAsks = () => asksOf(useDocOf(1, MessagesDoc), useDocOf(1, WorkspacesDoc))

/** The same, read once, for a command. */
export const currentAsks = () => {
  const docs = getState().docsOf[1]
  return asksOf(
    docs?.[MessagesDoc.kind] as MessagesData | null | undefined,
    docs?.[WorkspacesDoc.kind] as WorkspaceIndex | null | undefined,
  )
}

/**
 * The title bar's purple pill while anything waits on the user (a message's reply, a delivery's approval), on every
 * surface: how many, and a click jumps to the one waiting longest. Gone when none waits.
 */
export function WaitingPill() {
  const waiting = useAsks()
  const ultimate = useUltimate()
  const count = waiting.length
  const label = `${count} waiting on you`
  return (
    <>
      {/* Announced once per change of the count, not on every render. */}
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
