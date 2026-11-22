import { diagramKind, render } from 'lovely-mermaid'
import { FileTextIcon, FolderOpenIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Streamdown, defaultRehypePlugins } from 'streamdown'
import type { CustomRendererProps } from 'streamdown'
import { localMarkdownName } from '@/components/ai/local-markdown-link'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { defineWebExtension, useDialog, useUltimate } from '@/sdk'
import type { LinkRenderer } from '@/sdk/types'
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

const MarkdownLink: LinkRenderer = ({ href, children, core }) => {
  const { open } = useUltimate()
  const name = localMarkdownName(href)
  if (!name) return core
  return (
    <button
      className="cursor-pointer text-brand underline underline-offset-2 hover:no-underline"
      onClick={() => {
        requestedName = name
        open(id)
      }}
      type="button"
    >
      {children}
    </button>
  )
}

const boundedDiagramKinds = new Set(['flowchart', 'state', 'class', 'er', 'sequence'])

function Diagram({ code }: CustomRendererProps) {
  const art = useMemo(() => {
    if (code.length > 16_384 || !boundedDiagramKinds.has(diagramKind(code) ?? '')) return undefined
    try {
      const result = render(code)
      return result && !result.warnings.length ? result.plain.join('\n') : undefined
    } catch {
      return undefined
    }
  }, [code])
  return (
    <figure className="my-4 min-w-0 rounded-md border border-border bg-secondary/30">
      <figcaption className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {art ? 'Mermaid diagram' : 'Mermaid source · Diagram unavailable'}
      </figcaption>
      <pre className="m-0 overflow-x-auto px-3 py-4 font-mono text-xs leading-tight">
        {art ?? code}
      </pre>
      {art && (
        <details className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Show source</summary>
          <pre className="mt-2 overflow-x-auto font-mono">{code}</pre>
        </details>
      )}
    </figure>
  )
}

const passiveTags = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'ul',
  'ol',
  'li',
  'hr',
  'br',
  'em',
  'strong',
  'del',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]
const rehypePlugins = [defaultRehypePlugins.sanitize]
const singleBlock = (markdown: string) => [markdown]
const plugins = { renderers: [{ language: 'mermaid', component: Diagram }] }
const controls = { code: false, table: false, mermaid: false } as const

function DocumentView({ text }: { text: string }) {
  return (
    <Streamdown
      allowedElements={passiveTags}
      className="markdown mx-auto max-w-[72ch] break-words text-[14px] leading-relaxed [&_pre]:max-w-full [&_pre]:overflow-x-auto"
      controls={controls}
      mode="static"
      parseIncompleteMarkdown={false}
      parseMarkdownIntoBlocksFn={singleBlock}
      plugins={plugins}
      rehypePlugins={rehypePlugins}
      skipHtml
      unwrapDisallowed
    >
      {text}
    </Streamdown>
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

function ViewerBody({
  expanded,
  hint,
  toggle,
}: {
  expanded: boolean
  hint?: string
  toggle: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const documentBody = useRef<HTMLDivElement>(null)
  const position = useRef<Position>(fromTop)
  const anchors = useRef<NodeListOf<HTMLElement>>(undefined)
  const [file, setFile] = useState<{ key?: string; name: string; text: string }>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  function remember() {
    if (scroll.current) position.current = passage(scroll.current, anchors.current)
  }

  useLayoutEffect(() => {
    anchors.current = documentBody.current?.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,p,li:not(:has(li,p)),figure,hr,[data-streamdown="table-wrapper"],[data-streamdown="code-block"]',
    )
    position.current = (file?.key && readPosition(file.key)) || fromTop
    const key = file?.key
    if (!key) return undefined
    const save = () => writePosition(key, position.current)
    window.addEventListener('pagehide', save)
    return () => {
      window.removeEventListener('pagehide', save)
      save()
    }
  }, [file])

  useLayoutEffect(() => {
    const scroller = scroll.current
    if (!scroller) return
    const { block, fraction, end } = position.current
    const target = anchors.current?.[block]?.getBoundingClientRect()
    scroller.scrollTop = end
      ? scroller.scrollHeight
      : target && (block > 0 || fraction > 0)
        ? scroller.scrollTop +
          target.top -
          scroller.getBoundingClientRect().top +
          fraction * target.height
        : 0
  }, [file, expanded])

  async function choose(event: ChangeEvent<HTMLInputElement>) {
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
      <header className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 pr-12">
        <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <DialogTitle className="min-w-0 flex-1 truncate text-sm" title={file?.name ?? hint}>
          {file?.name ?? hint ?? 'Markdown viewer'}
        </DialogTitle>
        <Button
          disabled={pending}
          onClick={() => input.current?.click()}
          size="sm"
          variant="outline"
        >
          <FolderOpenIcon aria-hidden className="size-4" />
          Choose file
        </Button>
        <Button
          aria-label={expanded ? 'Restore Markdown viewer' : 'Expand Markdown viewer'}
          onClick={() => {
            remember()
            toggle()
          }}
          size="icon-sm"
          title={expanded ? 'Restore Markdown viewer' : 'Expand Markdown viewer'}
          variant="ghost"
        >
          {expanded ? <Minimize2Icon aria-hidden /> : <Maximize2Icon aria-hidden />}
        </Button>
        <input accept=".md" hidden onChange={choose} ref={input} type="file" />
      </header>
      <div
        aria-label="Markdown document"
        className="min-h-0 overflow-auto overscroll-contain px-4 py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-8 sm:py-6"
        data-markdown-scroll
        onScroll={remember}
        ref={scroll}
        role="region"
        tabIndex={0}
      >
        <DialogDescription className={file ? 'sr-only' : 'text-sm text-muted-foreground'}>
          {file
            ? 'Read-only Markdown preview.'
            : hint
              ? 'Choose the local Markdown file to open. Ultimate cannot read it from the link alone.'
              : 'Choose a local Markdown file. It stays in this browser.'}
        </DialogDescription>
        {error && (
          <p className="my-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {pending && (
          <p className="text-sm text-muted-foreground" role="status">
            Reading file…
          </p>
        )}
        {file &&
          (file.text.trim() ? (
            <div ref={documentBody}>
              <DocumentView text={file.text} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This file is empty.</p>
          ))}
      </div>
    </>
  )
}

function Viewer() {
  const [open, setOpen] = useDialog(id)
  const { conversationId } = useUltimate()
  const [expanded, setExpanded] = useState(() => readPreference('size') === 'expanded')
  function toggle() {
    const next = !expanded
    setExpanded(next)
    writePreference('size', next ? 'expanded' : 'compact')
  }
  useLayoutEffect(() => {
    if (!open) return undefined
    const blockFileDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('drop', blockFileDrop, true)
    return () => document.removeEventListener('drop', blockFileDrop, true)
  }, [open])
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestedName = undefined
        setOpen(next)
      }}
    >
      <DialogContent
        className={
          expanded
            ? 'top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-0 p-[env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] sm:max-w-none [&>[data-slot=dialog-close]]:top-[calc(1rem+env(safe-area-inset-top))] [&>[data-slot=dialog-close]]:right-[calc(1rem+env(safe-area-inset-right))]'
            : 'max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-3xl'
        }
        data-markdown-viewer
        data-resume-exclude
      >
        {open && (
          <ViewerBody
            expanded={expanded}
            hint={requestedName}
            key={conversationId}
            toggle={toggle}
          />
        )}
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
