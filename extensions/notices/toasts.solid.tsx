import { CircleAlert, Info, TriangleAlert, X } from '@lucide/solid'
import { createEffect, createSignal, onSettled, Show } from 'solid-js'
import { Dynamic } from '@solidjs/web'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  createToaster,
  Toast,
  ToastClose,
  ToastRegion,
  ToastTitle,
} from '@/components/ui/toast.solid.tsx'
import type { Notice } from '@/sdk/solid'
import { cn, useNotices } from '@/sdk/solid'

const shownFolded = 3
const lifetimeMs: Record<Notice['level'], number> = { info: 5000, warning: 9000, error: 15000 }
const icons = {
  info: { icon: Info, tone: 'text-muted-foreground' },
  warning: { icon: TriangleAlert, tone: 'text-warning' },
  error: { icon: CircleAlert, tone: 'text-error' },
}

export function Toasts() {
  const notices = useNotices()
  const toast = createToaster()
  const [open, setOpen] = createSignal(0)
  const [expanded, setExpanded] = createSignal(false)
  const shown = () => (expanded() ? open() : Math.min(open(), shownFolded))
  let seen = 0
  createEffect(notices, (all) => {
    for (const notice of all) {
      if (notice.id <= seen) continue
      seen = notice.id
      const duration = lifetimeMs[notice.level] - (Date.now() - notice.at)
      if (duration > 0) toast({ title: notice.message, type: notice.level, duration, data: notice })
    }
  })
  onSettled(() => {
    const count = () => {
      setOpen(toast.toasts().length)
      if (toast.toasts().length <= shownFolded) setExpanded(false)
    }
    const stop = toast.subscribe(count)
    count()
    return () => {
      stop()
      toast.dismiss()
    }
  })
  return (
    <ToastRegion
      aria-label="Notices"
      class="top-38 mt-0 max-h-[calc(100dvh-16rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-none border-0 bg-transparent p-2 shadow-none sm:w-[26rem] [&>ol]:flex [&>ol]:flex-col [&>ol]:gap-1.5 [&>ol]:divide-y-0"
      maxVisible={expanded() ? Math.max(open(), shownFolded) : shownFolded}
      toaster={toast}
    >
      {(item, live) => {
        const notice = item.data as Notice & { id: number }
        const look = icons[notice.level]
        return (
          <Toast class="flex-col gap-0 rounded-md border border-border/80 bg-popover p-0 shadow-md data-[type=error]:bg-[color-mix(in_oklab,var(--error)_6%,var(--popover))] data-[type=warning]:bg-[color-mix(in_oklab,var(--warning)_6%,var(--popover))]">
            <div class="flex w-full items-start gap-2 py-2 pr-1.5 pl-2.5">
              <Dynamic class={cn('mt-px size-3.5 shrink-0', look.tone)} component={look.icon} />
              <ToastTitle class="min-w-0 flex-1 break-words text-foreground/90" />
              <ToastClose aria-label={`Dismiss notice ${notice.id}: ${notice.message}`}>
                <X class="size-3.5" />
              </ToastClose>
            </div>
            <Show when={open() > 1 && !live.leaving && live.index === shown() - 1}>
              <div class="flex w-full items-center justify-end gap-1 border-t border-border/70 px-1.5 py-1 text-[11px] text-muted-foreground">
                <Show when={open() > shownFolded}>
                  <Button
                    aria-expanded={expanded() ? 'true' : 'false'}
                    onClick={() => {
                      setExpanded(!expanded())
                    }}
                    size="xs"
                    variant="ghost"
                  >
                    {expanded() ? 'Show less' : `+${open() - shownFolded} more`}
                  </Button>
                </Show>
                <Button onClick={() => toast.dismiss()} size="xs" variant="ghost">
                  Clear all
                </Button>
              </div>
            </Show>
          </Toast>
        )
      }}
    </ToastRegion>
  )
}
