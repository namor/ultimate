import { CircleAlertIcon, InfoIcon, TriangleAlertIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { cn, defineWebExtension, useNotices, useNow } from '@/sdk'
import type { Notice } from '@/sdk'

/** How long a notice stays, by level; hovering or focusing the stack keeps them. */
const lifetime: Record<Notice['level'], number> = { info: 5000, warning: 9000, error: 15000 }
/** How many show before the rest fold into "+N more". */
const visible = 3
const icons = {
  info: [InfoIcon, 'text-muted-foreground'],
  warning: [TriangleAlertIcon, 'text-warning'],
  error: [CircleAlertIcon, 'text-error'],
} as const

/**
 * Server and client notices as a stack of small cards centred under the header, clear of the side panels; on a phone
 * they span the width with a margin. Newest on top.
 */
function Toasts() {
  const notices = useNotices()
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set())
  const [held, setHeld] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const live = notices.some((notice) => Date.now() - notice.at < lifetime[notice.level])
  const now = useNow(500, live && !held)
  const open = notices
    .filter(
      (notice) => !dismissed.has(notice.id) && (held || now - notice.at < lifetime[notice.level]),
    )
    .toReversed()
  if (open.length === 0) return null
  const shown = expanded ? open : open.slice(0, visible)
  const dismiss = (ids: number[]) => setDismissed((previous) => new Set([...previous, ...ids]))
  return (
    <section
      aria-label="Notifications"
      className="fixed inset-x-2 top-20 z-40 mx-auto flex max-h-[calc(100dvh-10rem)] flex-col gap-1.5 sm:w-[26rem]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false)
      }}
      onFocus={() => setHeld(true)}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      {/* The padding keeps the cards' shadows inside the scroll box, which would clip them. */}
      <ol
        aria-live="polite"
        className="-m-2 flex min-h-0 flex-col gap-1.5 overflow-y-auto overscroll-contain p-2"
      >
        {shown.map((notice) => {
          const [Icon, tone] = icons[notice.level]
          return (
            <li
              className={cn(
                'group/notice flex animate-in items-start gap-2 rounded-md border border-border/80 bg-popover py-2 pr-1.5 pl-2.5 font-mono text-[11.5px] leading-snug shadow-md fade-in-0 slide-in-from-top-1',
                notice.level === 'error' &&
                  'bg-[color-mix(in_oklab,var(--error)_6%,var(--popover))]',
                notice.level === 'warning' &&
                  'bg-[color-mix(in_oklab,var(--warning)_6%,var(--popover))]',
              )}
              key={notice.id}
            >
              <Icon aria-label={notice.level} className={cn('mt-px size-3.5 shrink-0', tone)} />
              <span className="min-w-0 flex-1 break-words text-foreground/90">
                {notice.message}
              </span>
              <button
                aria-label="Dismiss"
                className="-my-0.5 shrink-0 rounded-sm p-0.5 text-muted-foreground/60 opacity-0 transition-opacity group-hover/notice:opacity-100 hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={(event) => {
                  // From the keyboard (no click count), hand focus to the next notice's dismiss, so it is not lost.
                  if (event.detail === 0) {
                    const item = event.currentTarget.closest('li')
                    const next = item?.nextElementSibling ?? item?.previousElementSibling
                    next?.querySelector('button')?.focus()
                  }
                  dismiss([notice.id])
                }}
                type="button"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ol>
      {open.length > 1 && (
        <div className="flex items-center gap-3 self-end rounded-md border border-border/80 bg-popover px-2 py-1 font-mono text-[11px] text-muted-foreground shadow-md">
          {open.length > visible && (
            <button
              aria-expanded={expanded}
              className="rounded-sm hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
              type="button"
            >
              {expanded ? 'Show less' : `+${open.length - visible} more`}
            </button>
          )}
          <button
            className="rounded-sm hover:text-foreground"
            onClick={() => {
              dismiss(open.map((notice) => notice.id))
              setExpanded(false)
              setHeld(false)
            }}
            type="button"
          >
            Clear all
          </button>
        </div>
      )}
    </section>
  )
}

export default defineWebExtension({ slots: { overlay: Toasts } })
