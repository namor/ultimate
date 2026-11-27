import { FileText, FolderOpen, Maximize2, Minimize2 } from '@lucide/solid'
import { createEffect, createSignal, For, onSettled, Show } from 'solid-js'
import { localMarkdownName } from '@/components/ai/local-markdown-link'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog.solid.tsx'
import { defineWebExtension, useConversationId, useDialog } from '@/sdk/solid'
import type { LinkRenderer } from '@/sdk/solid'
import { DocumentView } from './document.solid.tsx'
import {
  fileKey,
  readPosition,
  readPreference,
  writePosition,
  writePreference,
} from './preferences.ts'
import type { Position } from './preferences.ts'

const id = 'markdown-viewer.open'
let requestedName: string | undefined

const MarkdownLink: LinkRenderer = (props) => {
  const [, setOpen] = useDialog(id)
  return (
    <Show when={localMarkdownName(props.href)} fallback={props.core}>
      {(name) => (
        <Button
          class="inline h-auto rounded-none p-0 align-baseline text-[length:inherit] [font-weight:inherit] whitespace-normal text-brand underline underline-offset-2 hover:no-underline"
          onClick={() => {
            requestedName = name()
            setOpen(true)
          }}
          size={null}
          variant={null}
        >
          {props.children}
        </Button>
      )}
    </Show>
  )
}

const fromTop: Position = { block: 0, fraction: 0, end: false }

function passage(scroller: HTMLElement, blocks: NodeListOf<HTMLElement> | undefined): Position {
  const { scrollTop, scrollHeight, clientHeight } = scroller
  if (scrollTop < 1) return fromTop
  if (scrollHeight - clientHeight - scrollTop < 2) return { ...fromTop, end: true }
  if (!blocks?.length) return fromTop
  const top = scroller.getBoundingClientRect().top
  let low = 0
  let high = blocks.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (blocks[middle].getBoundingClientRect().bottom > top) high = middle
    else low = middle + 1
  }
  const rect = blocks[low]?.getBoundingClientRect()
  return rect?.height
    ? { block: low, fraction: Math.max(0, (top - rect.top) / rect.height), end: false }
    : fromTop
}

type ChosenFile = { key?: string; name: string; text: string }

function ViewerBody(props: { expanded: boolean; hint?: string; toggle: () => void }) {
  let input!: HTMLInputElement
  let scroll!: HTMLDivElement
  let position = fromTop
  let anchors: NodeListOf<HTMLElement> | undefined
  let shown: ChosenFile | undefined
  const [file, setFile] = createSignal<ChosenFile>()
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()

  function remember() {
    position = passage(scroll, anchors)
  }

  function save() {
    if (shown?.key) writePosition(shown.key, position)
  }

  onSettled(() => {
    window.addEventListener('pagehide', save)
    return () => {
      window.removeEventListener('pagehide', save)
      save()
    }
  })

  createEffect(
    () => [file(), props.expanded] as const,
    ([next]) => {
      if (next !== shown) {
        save()
        shown = next
        anchors = scroll
          .querySelector('[data-markdown-document]')
          ?.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li:not(:has(li,p)),figure,hr,.table,.code-block')
        position = (next?.key && readPosition(next.key)) || fromTop
      }
      const { block, fraction, end } = position
      const target = anchors?.[block]?.getBoundingClientRect()
      scroll.scrollTop = end
        ? scroll.scrollHeight
        : target && (block > 0 || fraction > 0)
          ? scroll.scrollTop +
            target.top -
            scroll.getBoundingClientRect().top +
            fraction * target.height
          : 0
    },
  )

  async function choose(event: Event & { currentTarget: HTMLInputElement }) {
    const chosen = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!chosen) return
    setError(undefined)
    if (!/\.md$/i.test(chosen.name) || chosen.size > 512 * 1024) {
      setError('Choose a .md file no larger than 512 KB.')
      return
    }
    setPending(true)
    try {
      const text = await chosen.text()
      const key = await fileKey(chosen, text)
      remember()
      setFile({ key, name: chosen.name, text })
    } catch {
      setError('Could not read this file. Choose it again or select another file.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <header class="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 pr-12">
        <FileText aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
        <DialogTitle class="min-w-0 flex-1 truncate text-sm" title={file()?.name ?? props.hint}>
          {file()?.name ?? props.hint ?? 'Markdown viewer'}
        </DialogTitle>
        <Button
          data-agent-confirm="Choose a file in the system picker"
          disabled={pending()}
          onClick={() => input.click()}
          size="sm"
          variant="outline"
        >
          <FolderOpen aria-hidden="true" class="size-4" />
          Choose file
        </Button>
        <Button
          aria-label={props.expanded ? 'Restore Markdown viewer' : 'Expand Markdown viewer'}
          onClick={() => {
            remember()
            props.toggle()
          }}
          size="icon-sm"
          title={props.expanded ? 'Restore Markdown viewer' : 'Expand Markdown viewer'}
          variant="ghost"
        >
          {props.expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        </Button>
        <input accept=".md" hidden onChange={choose} ref={input} type="file" />
      </header>
      <section
        aria-label="Markdown document"
        class="min-h-0 overflow-auto overscroll-contain px-4 py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-8 sm:py-6"
        data-markdown-scroll
        onScroll={remember}
        ref={scroll}
      >
        <DialogDescription class={file() ? 'sr-only' : 'text-sm text-muted-foreground'}>
          {file()
            ? 'Read-only Markdown preview.'
            : props.hint
              ? 'Choose the local Markdown file to open. Ultimate cannot read it from the link alone.'
              : 'Choose a local Markdown file. It stays in this browser.'}
        </DialogDescription>
        <Show when={error()}>
          <p class="my-2 text-sm text-error" role="alert">
            {error()}
          </p>
        </Show>
        <Show when={pending()}>
          <output class="block text-sm text-muted-foreground">Reading file…</output>
        </Show>
        <Show when={file()}>
          {(current) => (
            <Show
              when={current().text.trim()}
              fallback={<p class="text-sm text-muted-foreground">This file is empty.</p>}
            >
              <DocumentView text={current().text} />
            </Show>
          )}
        </Show>
      </section>
    </>
  )
}

function Viewer() {
  const [open, setOpen] = useDialog(id)
  const conversationId = useConversationId()
  const [expanded, setExpanded] = createSignal(readPreference('size') === 'expanded')
  function toggle() {
    const next = !expanded()
    setExpanded(next)
    writePreference('size', next ? 'expanded' : 'compact')
  }
  createEffect(open, (active) => {
    if (!active) return undefined
    const blockFileDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('drop', blockFileDrop, true)
    return () => document.removeEventListener('drop', blockFileDrop, true)
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={(next) => {
        if (!next) requestedName = undefined
        setOpen(next)
      }}
    >
      <DialogContent
        class={
          expanded()
            ? 'top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-0 p-[env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] sm:max-w-none [&>[data-slot=dialog-close]]:top-[calc(1rem+env(safe-area-inset-top))] [&>[data-slot=dialog-close]]:right-[calc(1rem+env(safe-area-inset-right))]'
            : 'max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-3xl'
        }
        data-markdown-viewer
        data-resume-exclude
      >
        <For each={open() ? [conversationId()] : []}>
          {() => <ViewerBody expanded={expanded()} hint={requestedName} toggle={toggle} />}
        </For>
      </DialogContent>
    </Dialog>
  )
}

export default defineWebExtension({
  commands: [
    {
      id,
      title: 'Open Markdown file…',
      run: ({ open }) => {
        requestedName = undefined
        open(id)
      },
    },
  ],
  link: MarkdownLink,
  slots: { overlay: Viewer },
})
