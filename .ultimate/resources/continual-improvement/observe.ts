const kinds = ['correction', 'failure', 'dream'] as const
type Kind = (typeof kinds)[number]

type Evidence = {
  project: unknown
  chapter: unknown
  signal: unknown
  kind: unknown
  ref: unknown
  dismissed?: unknown
}

export const subject = 'clean-test-environment'
export const maxEvidence = 64

export function observe(
  evidence: readonly Evidence[],
  scope: { project: string; chapter: string; after: number; through: number },
  dismissed: boolean,
) {
  if (dismissed || evidence.length > maxEvidence) return undefined
  const refs: Record<Kind, Set<number>> = {
    correction: new Set(),
    failure: new Set(),
    dream: new Set(),
  }
  for (const item of evidence) {
    const { project, chapter, signal, kind, ref } = item
    if (
      project !== scope.project ||
      chapter !== scope.chapter ||
      signal !== subject ||
      item.dismissed ||
      typeof ref !== 'number' ||
      !Number.isSafeInteger(ref) ||
      ref <= scope.after ||
      ref > scope.through
    )
      continue
    if (kind === 'correction' || kind === 'failure' || kind === 'dream') refs[kind].add(ref)
  }
  if (refs.correction.size < 2 || refs.failure.size < 2 || !refs.dream.size) return undefined
  return {
    subject,
    summary:
      'Review whether repeat test failures need a clean-environment check in the existing test guidance.',
    citations: kinds.map((kind) => ({ kind, refs: [...refs[kind]] })),
  }
}
