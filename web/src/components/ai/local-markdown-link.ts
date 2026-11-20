const prefix = '#local-markdown-'
// oxlint-disable-next-line eslint/no-control-regex -- Reject control characters in the displayed filename.
const isMarkdownName = (name: string) => /^[^/\\\u0000-\u001f\u007f]+\.md$/iu.test(name)

export function localMarkdownName(marker: string) {
  if (!marker.startsWith(prefix)) return undefined
  try {
    const name = decodeURIComponent(marker.slice(prefix.length))
    return isMarkdownName(name) ? name : undefined
  } catch {
    // An invalid escape cannot name a Markdown file.
    return undefined
  }
}

type Node = { type: string; url?: string; children?: Node[] }

function markerOf(url: string) {
  if (!/^file:\/\/\/[^/?#\\][^?#\\]*$/iu.test(url)) return undefined
  const name = localMarkdownName(prefix + url.slice(url.lastIndexOf('/') + 1))
  return name ? prefix + encodeURIComponent(name) : undefined
}

/** Keep only a display name, never a navigable file URL or an authority to read it. */
export function remarkLocalMarkdownLinks() {
  const visit = (node: Node) => {
    if (node.type === 'link' && node.url) node.url = markerOf(node.url) ?? node.url
    node.children?.forEach(visit)
  }
  return visit
}
