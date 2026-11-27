import type { ConversationId } from '@earendil-works/pi-durable'
import { Hourglass } from '@lucide/solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.solid.tsx'
import {
  ROOT,
  formatAgo,
  switchConversation,
  useConversationId,
  useDocOf,
  useNow,
} from '@/sdk/solid'
import { openMessages } from './data.ts'
import { MessagesDoc } from './refs.ts'
import type { Message } from './refs.ts'
import { Address } from './ui.solid.tsx'

const gist = (text: string) => text.replace(/\s+/g, ' ').trim()

function Section(props: {
  title: string
  messages: Message[]
  side: 'to' | 'from'
  now: number
  open: (id: ConversationId) => void
}) {
  return (
    <Show when={props.messages.length}>
      <div class="grid gap-0.5">
        <div class="px-1.5 section-label">{props.title}</div>
        <For each={props.messages} keyed={(message) => message.id}>
          {(message) => {
            const counterpart = () => message()[props.side]
            return (
              <Button
                aria-label={`${props.title} · message #${message().id}`}
                class="grid w-full min-w-0 gap-0.5 rounded-sm px-1.5 py-1 text-left font-[inherit] text-[length:inherit] font-normal hover:bg-accent"
                disabled={typeof counterpart() !== 'number'}
                onClick={() => {
                  const target = counterpart()
                  if (typeof target === 'number') props.open(target)
                }}
                size={null}
                variant={null}
              >
                <span class="flex min-w-0 items-center gap-1.5">
                  <span class="min-w-0 truncate font-sans">
                    <Address id={counterpart()} remote={message().remote} />
                  </span>
                  <span class="ml-auto shrink-0 text-muted-foreground">
                    {formatAgo(message().at, props.now)}
                  </span>
                </span>
                <span class="truncate text-muted-foreground">{gist(message().text)}</span>
              </Button>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

export function OpenMessages() {
  const id = useConversationId()
  const log = useDocOf(() => ROOT, MessagesDoc)
  const [shown, setShown] = createSignal(false)
  const now = useNow(30_000, shown)
  const open = createMemo(() => {
    const current = id()
    if (current !== undefined) return openMessages(log()?.messages ?? [], current)
    return undefined
  })
  const counts = createMemo(() => {
    const messages = open()
    if (!messages) return ''
    const { waiting, requests, delivering } = messages
    return [
      waiting.length && `${waiting.length} waiting`,
      requests.length && `${requests.length} to reply`,
      delivering.length && `${delivering.length} delivering`,
    ]
      .filter(Boolean)
      .join(' · ')
  })
  const go = (to: ConversationId) => {
    setShown(false)
    switchConversation(to)
  }
  return (
    <Show when={counts()}>
      <Popover onOpenChange={setShown} open={shown()}>
        <PopoverTrigger
          aria-label={`Open messages for #${id()}`}
          class="flex items-center gap-1.5 transition-colors hover:text-foreground max-md:hidden"
          data-open-messages
          title="Open messages"
        >
          <Hourglass class="size-3 text-amber-700/80 dark:text-amber-300/70" />
          {counts()}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Waiting, to reply and delivering messages"
          class="grid w-80 gap-2.5 p-1.5 font-mono text-[11px]"
          side="top"
        >
          <Section
            messages={open()?.waiting ?? []}
            now={now()}
            open={go}
            side="to"
            title="Waiting on"
          />
          <Section
            messages={open()?.requests ?? []}
            now={now()}
            open={go}
            side="from"
            title="Waiting for this agent’s reply"
          />
          <Section
            messages={open()?.delivering ?? []}
            now={now()}
            open={go}
            side="to"
            title="Delivering to"
          />
        </PopoverContent>
      </Popover>
    </Show>
  )
}
