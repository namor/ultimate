import { render } from 'grok-mermaid'
import { FileTextIcon, FolderOpenIcon } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Streamdown, defaultRehypePlugins } from 'streamdown'
import type { CustomRendererProps } from 'streamdown'
import { localMarkdownName } from '@/components/ai/local-markdown-link'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { defineWebExtension, useDialog, useUltimate } from '@/sdk'
import type { LinkRenderer } from '@/sdk/types'

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

function Diagram({ code }: CustomRendererProps) {
  const art = useMemo(() => {
    if (code.length > 16_384) return undefined
    try {
      const result = render(code)
      return result && !result.warnings.length ? result.plain.join('\n') : undefined
    } catch {
      // A failed layout leaves the original source readable.
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

// The private reader does not use chat extensions, parse raw HTML, or create navigable/resource-bearing elements.
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
// Streamdown 2.7 also calls its block splitter in static mode. Its default retains the last document.
const singleBlock = (markdown: string) => [markdown]
const plugins = { renderers: [{ language: 'mermaid', component: Diagram }] }
const controls = { code: false, table: false, mermaid: false } as const

function DocumentView({ text }: { text: string }) {
  return (
    <Streamdown
      allowedElements={passiveTags}
      className="markdown mx-auto max-w-[72ch] text-[14px] leading-relaxed"
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

function ViewerBody({ hint }: { hint?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; text: string }>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

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
      setFile({ name: chosen.name, text })
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
        <input accept=".md" hidden onChange={choose} ref={input} type="file" />
      </header>
      <div className="min-h-0 overflow-auto px-4 py-5 sm:px-8 sm:py-6">
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
            <DocumentView text={file.text} />
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
  useLayoutEffect(() => {
    if (!open) return undefined
    // The composer accepts page-wide file drops. Do not let drops on this dialog or its backdrop upload files.
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
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-3xl"
        data-markdown-viewer
      >
        {open && <ViewerBody hint={requestedName} key={conversationId} />}
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
