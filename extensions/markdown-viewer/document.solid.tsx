import { dynamic } from '@solidjs/web'
import type { JSX } from '@solidjs/web'
import type { ElementContent } from 'hast'
import { diagramKind, render } from 'lovely-mermaid'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { createMemo, For, Match, Show, Switch } from 'solid-js'
import { unified } from 'unified'

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
const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, {
    tagNames: passiveTags,
    attributes: {
      code: [['className', /^language-/]],
      ol: ['start'],
      td: ['align'],
      th: ['align'],
    },
  })

const boundedDiagramKinds = new Set(['flowchart', 'state', 'class', 'er', 'sequence'])

function Diagram(props: { code: string }) {
  const art = createMemo(() => {
    const code = props.code
    if (code.length > 16_384 || !boundedDiagramKinds.has(diagramKind(code) ?? '')) return undefined
    try {
      const result = render(code)
      return result && !result.warnings.length ? result.plain.join('\n') : undefined
    } catch {
      return undefined
    }
  })
  return (
    <figure class="my-4 min-w-0 rounded-md border border-border bg-secondary/30">
      <figcaption class="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {art() ? 'Mermaid diagram' : 'Mermaid source · Diagram unavailable'}
      </figcaption>
      <pre class="m-0 overflow-x-auto px-3 py-4 font-mono text-xs leading-tight">
        {art() ?? props.code}
      </pre>
      <Show when={art()}>
        <details class="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <summary>Show source</summary>
          <pre class="mt-2 overflow-x-auto font-mono">{props.code}</pre>
        </details>
      </Show>
    </figure>
  )
}

function Nodes(props: { nodes: ElementContent[] }) {
  return <For each={props.nodes}>{(node) => renderNode(node)}</For>
}

function renderNode(node: ElementContent): JSX.Element {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return undefined
  const Tag = dynamic(() => node.tagName)
  const content = () => <Nodes nodes={node.children} />
  const code = node.tagName === 'pre' ? node.children[0] : undefined
  const language =
    code?.type === 'element' &&
    code.tagName === 'code' &&
    Array.isArray(code.properties.className) &&
    code.properties.className.find(
      (name) => typeof name === 'string' && name.startsWith('language-'),
    )
  const source =
    code?.type === 'element'
      ? code.children.map((part) => (part.type === 'text' ? part.value : '')).join('')
      : ''
  const align = node.properties.align
  const start = node.properties.start
  return (
    <Switch
      fallback={
        <Tag start={start} style={typeof align === 'string' ? { 'text-align': align } : undefined}>
          {content()}
        </Tag>
      }
    >
      <Match when={language === 'language-mermaid'}>
        <Diagram code={source} />
      </Match>
      <Match when={node.tagName === 'pre'}>
        <div class="code-block">
          <Show when={typeof language === 'string' && language.slice('language-'.length)}>
            {(name) => (
              <div class="code-block-header">
                <span>{name()}</span>
              </div>
            )}
          </Show>
          <pre>{content()}</pre>
        </div>
      </Match>
      <Match when={node.tagName === 'table'}>
        <div class="table">
          <div class="max-h-[400px]">
            <table>{content()}</table>
          </div>
        </div>
      </Match>
    </Switch>
  )
}

export function DocumentView(props: { text: string }) {
  const nodes = createMemo(() =>
    parser.runSync(parser.parse(props.text)).children.filter((node) => node.type !== 'doctype'),
  )
  return (
    <div
      class="markdown mx-auto max-w-[72ch] break-words text-[14px] leading-relaxed [&_pre]:max-w-full [&_pre]:overflow-x-auto"
      data-agent-hidden
      data-markdown-document
    >
      <Nodes nodes={nodes()} />
    </div>
  )
}
