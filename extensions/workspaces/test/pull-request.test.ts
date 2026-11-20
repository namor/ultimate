import { expect, it } from 'vitest'
import { pullRequestText } from '../pull-request.ts'

const old = {
  settings: { checks: ['private check command'] },
  risk: 'low' as const,
  review: 'private review notes',
  candidate: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  baseline: 'c'.repeat(40),
  runtime: 'v26.1.0/darwin/arm64',
  facts: { subject: { summary: 'private chat summary' }, divergence: 'private task notes' },
}

it('uses only the receipt for a submission without explicit public copy', () => {
  const { title, body } = pullRequestText(old)
  expect(title).toBe('Deliver verified candidate aaaaaaa')
  expect(body).toContain('1 check passed')
  expect(body).toContain(old.candidate)
  expect(body).toContain(old.tree)
  expect(body).toContain(old.baseline)
  expect(body).not.toContain('private')
})

it('keeps the public explanation and its Markdown before the candidate receipt', () => {
  const pullRequest = {
    title: 'Keep the original run on retry',
    body: 'Before: `POST /runs` started a second run.\n\nNow the retry returns the original run.\n\nReported from /Users/example/log.',
  }
  const { title, body } = pullRequestText({ ...old, pullRequest })
  expect(title).toBe(pullRequest.title)
  expect(body.startsWith(pullRequest.body.replace('/Users/example/log.', '<path>'))).toBe(true)
  expect(body).toContain('### Delivery receipt')
  expect(body).not.toContain('private')
})
