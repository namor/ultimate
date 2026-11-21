import { ChevronRightIcon, InboxIcon } from 'lucide-react'
import {
  ROOT,
  cn,
  column,
  defineWebExtension,
  useConversation,
  useDocOf,
  useExtensions,
  useUltimate,
} from '@/sdk'
import type { ComposerRenderer } from '@/sdk'
import { Waiting } from '../inbox/ui.tsx'
import { StandingDoc } from '../subagents/ui.tsx'

function InboxBar() {
  const { showSurface } = useUltimate()
  return (
    <Waiting>
      {(items) => {
        const count = items.length
        if (!count) return null
        const label = count === 1 ? '1 item needs your input' : `${count} items need your input`
        return (
          <div className={cn(column(), 'mb-2 shrink-0')}>
            <button
              aria-label={`${label}: open Inbox`}
              className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-purple-500/40 bg-purple-500/10 px-3 text-left text-xs text-purple-700 outline-none hover:bg-purple-500/20 focus-visible:ring-2 focus-visible:ring-purple-500/60 dark:text-purple-300"
              onClick={() => showSurface('inbox')}
              type="button"
            >
              <InboxIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="flex-1">{label}</span>
              <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
            </button>
          </div>
        )
      }}
    </Waiting>
  )
}

const InboxComposer: ComposerRenderer = ({ core, dock }) => {
  const id = useConversation((conversation) => conversation.id)
  const primary = useDocOf(ROOT, StandingDoc)?.ultimate
  const { surface } = useUltimate()
  const inbox = useExtensions().some(({ name, extension }) => name === 'inbox' && extension)
  return (
    <>
      {inbox && !dock && surface === 'agent' && id !== undefined && id === primary && <InboxBar />}
      {core}
    </>
  )
}

export default defineWebExtension({ composer: InboxComposer })
