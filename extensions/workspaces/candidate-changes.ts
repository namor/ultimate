import { exec } from '../../lib/exec.ts'
import type { Delivery } from './delivery.ts'

function preview(entries: string[], limit: number) {
  return {
    count: entries.length,
    items: entries
      .slice(0, limit)
      .map((entry) => (entry.length > 240 ? `${entry.slice(0, 180)}…${entry.slice(-59)}` : entry)),
  }
}

export async function readCandidateChanges(
  cwd: string,
  { baseline, candidate }: Pick<Delivery, 'baseline' | 'candidate'>,
  signal: AbortSignal,
): Promise<NonNullable<Delivery['changes']>> {
  const read = async (...args: string[]) =>
    (
      await exec('git', ['--no-replace-objects', ...args], {
        cwd,
        signal,
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      })
    ).stdout
  const commits = await read(
    'log',
    '--no-show-signature',
    '-z',
    '--format=%s',
    `${baseline}..${candidate}`,
    '--',
  )
  const paths = await read(
    '-c',
    'core.quotePath=false',
    'diff',
    '--no-ext-diff',
    '--no-relative',
    '--no-renames',
    '--ignore-submodules=none',
    '--name-only',
    baseline,
    candidate,
    '--',
  )
  return {
    commits: preview(
      commits
        .split('\0')
        .slice(0, -1)
        .map((subject) => subject || '(no subject)'),
      6,
    ),
    paths: preview(paths.split('\n').slice(0, -1), 8),
  }
}
