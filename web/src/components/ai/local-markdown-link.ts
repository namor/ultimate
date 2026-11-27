const prefix = '#local-markdown-'
const isMarkdownName = (name: string) => /^[^/\\\p{Cc}]+\.md$/iu.test(name)

export function localMarkdownName(marker: string) {
  if (!marker.startsWith(prefix)) return undefined
  try {
    const name = decodeURIComponent(marker.slice(prefix.length))
    return isMarkdownName(name) ? name : undefined
  } catch {
    return undefined
  }
}

type Node = { type: string; url?: string; identifier?: string; children?: Node[] }

function markerOf(url: string) {
  if (!/^file:\/\/\/[^/?#\\][^?#\\]*$/iu.test(url)) return undefined
  const name = localMarkdownName(prefix + url.slice(url.lastIndexOf('/') + 1))
  return name ? prefix + encodeURIComponent(name) : undefined
}

export function remarkLocalMarkdownLinks() {
  const walk = (node: Node, visit: (node: Node) => void) => {
    visit(node)
    node.children?.forEach((child) => walk(child, visit))
  }
  return (root: Node) => {
    const definitions = new Map<string, string>()
    walk(root, (node) => {
      if (node.type === 'definition' && node.identifier && !definitions.has(node.identifier)) {
        definitions.set(node.identifier, node.url ?? '')
      }
    })
    walk(root, (node) => {
      const url = node.type === 'linkReference' ? definitions.get(node.identifier ?? '') : node.url
      if (!url || (node.type !== 'link' && node.type !== 'linkReference')) return
      const marker = markerOf(url)
      if (marker) {
        node.type = 'link'
        node.url = marker
      }
    })
  }
}
