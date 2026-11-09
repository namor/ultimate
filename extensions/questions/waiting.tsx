import { MessageCircleQuestionIcon } from 'lucide-react'
import { cn, events, useDocOf, useUltimate } from '@/sdk'
import { MessagesDoc, emptyMessages } from '../messages/ui.tsx'
import { oldestWaiting, waiting } from './open.tsx'

/** Opens the asker's conversation at the message; `messages:open` checks it still waits and scrolls to its card. */
export function openMessage(
  message: { id: number; from: number },
  ultimate: { showSurface: (id: string) => void; switchConversation: (id: number) => void },
) {
  events.emit('messages:open', { conversation: message.from, message: message.id })
  ultimate.showSurface('agent')
  ultimate.switchConversation(message.from)
}

/**
 * The title bar's purple pill while anything waits on the user's answer, on every surface: how many, and a click
 * jumps to the one waiting longest. Gone when none waits.
 */
export function WaitingPill() {
  const messages = (useDocOf(1, MessagesDoc) ?? emptyMessages).messages
  const ultimate = useUltimate()
  const count = waiting(messages).length
  // A message from another project is answered in @ultimate's conversation, so only a local asker is a jump target.
  const oldest = oldestWaiting(messages.filter((message) => typeof message.from === 'number'))
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
          className={cn(
            'flex h-6 cursor-pointer items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 px-2 font-mono text-[11px] text-purple-700 transition-colors outline-none hover:bg-purple-500/20 focus-visible:ring-2 focus-visible:ring-purple-500/60 max-md:h-7 dark:text-purple-300',
          )}
          data-waiting-pill={oldest?.id}
          onClick={() =>
            oldest
              ? openMessage(oldest as { id: number; from: number }, ultimate)
              : ultimate.openPanel('todos')
          }
          title="Open the oldest message waiting on you"
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
