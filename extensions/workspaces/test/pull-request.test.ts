import { expect, it } from 'vitest'
import { pullRequestText } from '../pull-request.ts'
import type { PullRequestFacts } from '../pull-request.ts'

const facts: PullRequestFacts = {
  subject: {
    title: 'Generate concise delivery pull requests from facts already collected by the lander',
    summary:
      'Describe the change up front. Make merge risks easy to scan. Record checks on the exact candidate. Keep this sentence out.',
    feature: 'Delivery PRs',
  },
  divergence: 'None',
  risk: 'medium',
  review: '  Independent reviewer #125 approved.\n  Evidence: /Users/example/my-app/check.log  ',
  candidate: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  baseline: 'c'.repeat(40),
  commits: ['d'.repeat(40) + ' Describe delivery changes'],
  paths: [
    'extensions/workspaces/delivery.ts',
    'extensions/workspaces/lander.ts',
    'extensions/workspaces/wait.ts',
    'extensions/workspaces/pull-request.ts',
    'extensions/workspaces/README.md',
    'extensions/workspaces/test/pull-request.test.ts',
    'server/extensions.ts',
    'test/workspaces.test.ts',
  ],
  checks: [{ command: 'pnpm check', ms: 75000 }, { command: 'pnpm test' }],
  runtime: 'v26.1.0/darwin/arm64',
  conversationId: 123,
  lander: 124,
  rebuild: 1,
}

it('renders a concise delivery PR with exact-candidate evidence and no local review path', () => {
  const { title, body } = pullRequestText(facts)
  expect(title.length).toBeLessThanOrEqual(72)
  expect(title).toMatch(/^workspaces: .+…$/)
  expect(body.match(/^## .+$/gm)).toEqual([
    '## Summary',
    '## Changes',
    '## Blast radius',
    '## Risk',
    '## Verification',
    '## Divergence',
    '## Links',
  ])
  expect(body.split('## Changes')[0]?.match(/^- .+$/gm)).toEqual([
    '- Describe the change up front.',
    '- Make merge risks easy to scan.',
    '- Record checks on the exact candidate.',
  ])
  expect(body).toContain('- **workspaces** (6 files): delivery.ts, lander.ts, wait.ts, +3')
  expect(body).toContain('Host restart needed')
  expect(body).not.toContain('/Users/')
  expect(body).toContain('Review: Independent reviewer #125 approved. Evidence: <path>')
  expect(body).toContain('Local: 2 checks passed on v26.1.0/darwin/arm64')
  expect(body).toContain('pnpm check (1m 15s)')
  expect(body).toContain('Candidate ' + facts.candidate)
  expect(body).toContain(
    'Rebuild 1: replaces the earlier PR of this submission after the base moved',
  )
})

it('uses the first commit subject and reports no restart for test-only changes', () => {
  const { title, body } = pullRequestText({
    ...facts,
    subject: undefined,
    paths: ['test/workspaces.test.ts'],
    rebuild: 0,
  })
  expect(title).toBe('test: Describe delivery changes')
  expect(body).toContain('Tests only')
  expect(body).toContain('No host restart needed')
  expect(body).not.toContain('Rebuild ')
})
