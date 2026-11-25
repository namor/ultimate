import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { git } from '../../../../lib/git.ts'
import { temp } from '../../../../test/helpers.ts'
import { readCandidateChanges } from '../../candidate-changes.ts'

it('summarizes the candidate against the delivery baseline, not the checked-out tip', async () => {
  const cwd = await temp()
  await git(cwd, 'init', '-b', 'main')
  await git(cwd, 'config', 'user.name', 'Fixture')
  await git(cwd, 'config', 'user.email', 'fixture@example.invalid')
  await git(cwd, 'commit', '--allow-empty', '-m', 'Baseline')
  const baseline = await git(cwd, 'rev-parse', 'HEAD')
  const path = 'line\nbreak.txt'
  await writeFile(join(cwd, path), 'Candidate content')
  const blob = await git(cwd, 'hash-object', '-w', '--', path)
  const paths = [path, ...Array.from({ length: 4500 }, (_, n) => `${'z'.repeat(240)}${n}`)]
  const tree = execFileSync('git', ['mktree', '-z'], {
    cwd,
    encoding: 'utf8',
    input: paths.map((name) => `100644 blob ${blob}\t${name}\0`).join(''),
  }).trim()
  const candidate = await git(
    cwd,
    'commit-tree',
    tree,
    '-p',
    baseline,
    '-m',
    'Add candidate content',
  )
  await git(cwd, 'commit', '--allow-empty', '-m', 'Unrelated checkout')

  const changes = await readCandidateChanges(
    cwd,
    { baseline, candidate },
    new AbortController().signal,
  )
  expect(changes.commits).toEqual({ count: 1, items: ['Add candidate content'] })
  expect(changes.paths.count).toBe(paths.length)
  expect(changes.paths.items).toHaveLength(8)
  expect(changes.paths.items[0]).toBe('"line\\nbreak.txt"')
})
