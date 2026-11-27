import { once } from 'node:events'
import { spawn } from '../../lib/spawn.ts'
import type { ChangePreview, Delivery } from './delivery.ts'

async function readPreview(
  cwd: string,
  signal: AbortSignal,
  limit: number,
  separator: string,
  ...args: string[]
): Promise<ChangePreview> {
  signal.throwIfAborted()
  const git = spawn('git', ['--no-replace-objects', ...args], {
    cwd,
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const preview = async () => {
    const items: string[] = []
    let count = 0
    let tail = ''
    for await (const chunk of git.stdout.setEncoding('utf8')) {
      const entries = (tail + chunk).split(separator)
      tail = entries.pop()!
      for (const entry of entries) {
        if (count < limit)
          items.push(
            entry.length > 240
              ? `${entry.slice(0, 180)}…${entry.slice(-59)}`
              : entry || '(no subject)',
          )
        count++
      }
    }
    return { count, items }
  }
  const [[code], changes] = await Promise.all([once(git, 'close'), preview()])
  if (code !== 0) throw new Error('Git could not read the candidate changes')
  return changes
}

export async function readCandidateChanges(
  cwd: string,
  { baseline, candidate }: Pick<Delivery, 'baseline' | 'candidate'>,
  signal: AbortSignal,
): Promise<NonNullable<Delivery['changes']>> {
  const commits = await readPreview(
    cwd,
    signal,
    6,
    '\0',
    'log',
    '--no-show-signature',
    '-z',
    '--format=%s',
    `${baseline}..${candidate}`,
    '--',
  )
  const paths = await readPreview(
    cwd,
    signal,
    8,
    '\n',
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
  return { commits, paths }
}
