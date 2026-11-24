import { ChevronRight, Inbox } from '@lucide/solid'
import { Show } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  ROOT,
  cn,
  column,
  defineWebExtension,
  showSurface,
  useConversation,
  useDocOf,
  useExtensions,
  useSurface,
} from '@/sdk/solid'
import type { SolidComposerProps } from '@/sdk/solid'
import { Waiting } from '../inbox/ui.solid.tsx'
import { StandingDoc } from '../subagents/refs.ts'

function InboxBar() {
  const { entries } = Waiting()
  const count = () => entries().length
  const label = () =>
    count() === 1 ? '1 item needs your input' : `${count()} items need your input`
  return (
    <Show when={count() > 0}>
      <div class={cn(column(), 'mb-2 shrink-0')}>
        <Button
          aria-label={`${label()}: open Inbox`}
          class="flex min-h-9 w-full gap-2 rounded-md border border-purple-500/40 bg-purple-500/10 px-3 text-left text-xs font-normal text-purple-700 hover:bg-purple-500/20 focus-visible:border-purple-500/40 focus-visible:ring-2 focus-visible:ring-purple-500/60 dark:text-purple-300"
          onClick={() => showSurface('inbox')}
          size={null}
          variant={null}
        >
          <Inbox aria-hidden="true" class="size-3.5 shrink-0" />
          <span class="flex-1">{label()}</span>
          <ChevronRight aria-hidden="true" class="size-3.5 shrink-0" />
        </Button>
      </div>
    </Show>
  )
}

function InboxComposer(props: SolidComposerProps) {
  const conversation = useConversation()
  const standing = useDocOf(() => ROOT, StandingDoc)
  const surface = useSurface()
  const extensions = useExtensions()
  const showBar = () => {
    const id = conversation().id
    return (
      !props.dock &&
      surface() === 'agent' &&
      id !== undefined &&
      id === standing()?.ultimate &&
      extensions().some(({ name, extension }) => name === 'inbox' && extension)
    )
  }
  return (
    <>
      <Show when={showBar()}>
        <InboxBar />
      </Show>
      {props.core}
    </>
  )
}

export default defineWebExtension({ composer: InboxComposer })
