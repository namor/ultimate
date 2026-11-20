import type { DeliveryRisk } from './delivery.ts'

export type PullRequestFacts = {
  subject?: { title?: string; summary?: string; feature?: string }
  divergence: string
  risk: DeliveryRisk
  review: string
  candidate: string
  tree: string
  baseline: string
  commits: string[]
  paths: string[]
  checks: { command: string; ms?: number }[]
  runtime: string
  conversationId: number
  lander: number
  rebuild?: number
}

const sentences = new Intl.Segmenter('en', { granularity: 'sentence' })
const singleLine = (value: string) => value.trim().replace(/[^\S\r\n]*[\r\n]+\s*/g, ' ')
const redact = (value: string) =>
  value
    .replace(/(["'`])(?:file:\/\/)?(?:\/(?!\/)|[a-z]:[\\/])[^\r\n<>]*?\1/gi, '$1<path>$1')
    .replace(/(^|[\s(["'`=])(?:file:\/\/)?(?:\/(?!\/)|[a-z]:[\\/])[^\s<>"'`),;\]]+/gi, '$1<path>')
    .replace(/\/(?:Users|home)\/[^\s<>"'`),;\]]*/g, '<path>')
    .replace(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}\b/gi, '<email>')
    .replace(
      /\b(authorization:\s*bearer\s+|(?:[\w-]*(?:token|secret|password|api[_-]?key)|user(?:name)?)\s*=\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,
      '$1<redacted>',
    )
    .replace(/\b(?:gh[pousr]_|github_pat_|sk-(?:proj-)?)[a-z0-9_-]{16,}\b/gi, '<redacted>')

const shorten = (value: string, limit: number) => {
  if (value.length <= limit) return value
  const prefix = value.slice(0, limit - 1)
  const boundary = value[limit - 1]?.match(/\s/) ? prefix : prefix.replace(/\s+\S*$/, '')
  return `${boundary.trimEnd()}…`
}

export function pullRequestText(facts: PullRequestFacts): { title: string; body: string } {
  const { subject, paths, risk, review, checks, rebuild } = facts
  const groups = new Map<string, string[]>()
  const extensions = new Set<string>()
  for (const path of paths) {
    const parts = path.split('/')
    const extension = parts[0] === 'extensions' && parts.length > 2 ? parts[1] : undefined
    if (extension) extensions.add(extension)
    const area = extension ?? (parts.length === 1 ? 'config' : parts[0])
    const files = groups.get(area) ?? []
    files.push(parts.at(-1)!)
    groups.set(area, files)
  }
  const areas = [...groups].toSorted(
    ([a, left], [b, right]) => right.length - left.length || a.localeCompare(b),
  )
  const prefix = `${shorten(redact(areas[0]?.[0] ?? 'config'), 69)}: `
  const commitSubject = facts.commits[0]?.replace(/^\S+\s+/, '')
  const headline =
    singleLine(subject?.title ?? '') || singleLine(commitSubject ?? '') || 'Update files'
  const title = prefix + shorten(redact(headline), 72 - prefix.length)
  const summary = [...sentences.segment(redact(singleLine(subject?.summary ?? '')))]
    .slice(0, 3)
    .map(({ segment }) => `- ${segment.trim()}`)
  if (!summary.length) summary.push(`- ${title}`)
  const feature = singleLine(subject?.feature ?? '')
  if (feature) summary.push('', `_${feature}_`)

  const changes = areas.map(([area, files]) => {
    const names = files.length > 4 ? [...files.slice(0, 3), `+${files.length - 3}`] : files
    return `- **${area}** (${files.length} ${files.length === 1 ? 'file' : 'files'}): ${names.join(', ')}`
  })
  const restart = paths.some(
    (path) => /^(server|shared|patches)\//.test(path) || path === 'pnpm-lock.yaml',
  )
  const ui = paths.some((path) => path.startsWith('web/') || path.endsWith('.tsx'))
  const deps = paths.some((path) => path === 'pnpm-lock.yaml' || /(^|\/)package\.json$/.test(path))
  const docs = paths.some((path) => /^(agents|skills|docs)\//.test(path) || path.endsWith('.md'))
  const isTest = (path: string) => /^(?:extensions\/[^/]+\/)?test\//.test(path)
  const testsOnly = paths.length > 0 && paths.every(isTest)
  const blast = [
    restart ? 'Host restart needed' : `No host restart needed${testsOnly ? '; Tests only' : ''}`,
    !testsOnly && paths.some(isTest) && 'Tests changed',
    ui && 'UI changes',
    extensions.size > 0 && `Extensions: ${[...extensions].toSorted().join(', ')}`,
    deps && 'Dependency change',
    docs && 'Prompts and docs',
  ].filter(Boolean)
  const areaList = areas.map(([area]) => area).join(', ')
  const reason = restart
    ? 'Changed paths require a host restart.'
    : testsOnly
      ? 'Only test paths changed.'
      : areaList
        ? `Changed areas: ${areaList}; no host restart needed.`
        : 'No changed paths listed.'
  const local = checks.map(({ command, ms }) => {
    const seconds = ms === undefined ? undefined : Math.floor(ms / 1000)
    return `- ${singleLine(command)}${seconds === undefined ? '' : ` (${Math.floor(seconds / 60)}m ${seconds % 60}s)`}`
  })

  const sections: [string, string][] = [
    ['Summary', summary.join('\n')],
    ['Changes', changes.join('\n') || 'None'],
    ['Blast radius', blast.map((layer) => `- ${layer}`).join('\n')],
    [
      'Risk',
      [
        `**${risk}** — ${reason}`,
        `Could break: ${areaList || 'None'}`,
        'Mitigation: local verification, exact-head CI, and independent review.',
        'Rollback: revert the merge commit.',
      ].join('\\\n'),
    ],
    [
      'Verification',
      [
        `Local: ${checks.length} checks passed on ${singleLine(facts.runtime)}`,
        ...local,
        ...(local.length ? [''] : []),
        'CI: required checks must pass on the exact head before merge\\',
        `Review: ${singleLine(review) || 'None'}`,
      ].join('\n'),
    ],
    ['Divergence', facts.divergence.trim() ? facts.divergence : 'None'],
    [
      'Links',
      [
        `Branch conversation #${facts.conversationId} · Lander log #${facts.lander} · Candidate ${facts.candidate} · Tree ${facts.tree} · Base ${facts.baseline}`,
        ...(rebuild && rebuild > 0
          ? [`Rebuild ${rebuild}: replaces the earlier PR of this submission after the base moved`]
          : []),
      ].join('\\\n'),
    ],
  ]
  return {
    title,
    body: sections.map(([heading, content]) => `## ${heading}\n${redact(content)}`).join('\n\n'),
  }
}
