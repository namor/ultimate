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
  await git(cwd, 'add', '--', path)
  await git(cwd, 'commit', '-m', 'Add candidate content')
  const candidate = await git(cwd, 'rev-parse', 'HEAD')
  await git(cwd, 'rm', '--', path)
  await git(cwd, 'commit', '-m', 'Remove content after the candidate')

  await expect(
    readCandidateChanges(cwd, { baseline, candidate }, new AbortController().signal),
  ).resolves.toEqual({
    commits: { count: 1, items: ['Add candidate content'] },
    paths: { count: 1, items: ['"line\\nbreak.txt"'] },
  })
})
