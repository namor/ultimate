import type { Delivery } from './delivery.ts'

export type PullRequestCopy = { title: string; body: string }

const redact = (text: string) =>
  text
    .replace(/(?:file:\/\/)?\/(?:Users|home)\/[^\s<>"'`),;\]]*/g, '<path>')
    .replace(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}\b/gi, '<email>')
    .replace(
      /\b(authorization:\s*bearer\s+|(?:[\w-]*(?:token|secret|password|api[_-]?key)|user(?:name)?)\s*=\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,
      '$1<redacted>',
    )
    .replace(/\b(?:gh[pousr]_|github_pat_|sk-(?:proj-)?)[a-z0-9_-]{16,}\b/gi, '<redacted>')

type Receipt = Pick<
  Delivery,
  'pullRequest' | 'risk' | 'runtime' | 'candidate' | 'tree' | 'baseline'
> & {
  settings: Pick<Delivery['settings'], 'checks'>
}

export function pullRequestText(d: Receipt): PullRequestCopy {
  const copy = d.pullRequest
  const count = d.settings.checks.length
  const receipt = [
    '### Delivery receipt',
    '',
    `Local verification: ${count} ${count === 1 ? 'check' : 'checks'} passed on \`${d.runtime}\`. Independent review covers the tested tree.`,
    `Risk: ${d.risk}. Required CI must pass on the exact head before merge.`,
    '',
    `Candidate: \`${d.candidate}\`  `,
    `Tree: \`${d.tree}\`  `,
    `Base: \`${d.baseline}\``,
  ].join('\n')
  return {
    title: copy
      ? redact(copy.title.trim())
      : `Deliver verified candidate ${d.candidate.slice(0, 7)}`,
    body: copy ? `${redact(copy.body.trim())}\n\n---\n\n${receipt}` : receipt,
  }
}
