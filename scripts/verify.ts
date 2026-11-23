import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'

const store = spawnSync('pnpm', ['store', 'path', '--silent'], {
  cwd: tmpdir(),
  env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1' },
  encoding: 'utf8',
})
if (store.status !== 0 || !store.stdout.trim()) throw new Error('Cannot resolve the pnpm store')
const home = mkdtempSync(join(tmpdir(), 'ultimate-verify-'))
const env = {
  PATH: process.env.PATH,
  HOME: home,
  TMPDIR: home,
  CI: '1',
  PNPM_CONFIG_STORE_DIR: store.stdout.trim(),
}
const commands: [phase: string, command: string, args: string[]][] = [
  ['install', 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline']],
  [
    'install-deepwiki',
    'pnpm',
    [
      '--dir',
      '.ultimate/extensions/deepwiki',
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--ignore-workspace',
    ],
  ],
  [
    'install-public-docs',
    'pnpm',
    [
      '--dir',
      '.ultimate/extensions/public-docs',
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--ignore-workspace',
    ],
  ],
  ['check', 'pnpm', ['check']],
  ['fast', 'pnpm', ['test']],
  ['e2e', 'pnpm', ['test:e2e']],
  [
    'cursor-runner',
    process.execPath,
    ['--test', '.ultimate/extensions/cursor-task/test/e2e/runner.test.ts'],
  ],
  [
    'cursor-tests',
    'pnpm',
    ['exec', 'vp', 'test', '--config', '.ultimate/extensions/cursor-task/test/vite.config.ts'],
  ],
  ['deepwiki', process.execPath, ['.ultimate/extensions/deepwiki/verify.mjs', process.cwd()]],
  ['public-docs', process.execPath, ['.ultimate/extensions/public-docs/verify.mjs', process.cwd()]],
]
try {
  console.log(
    `Verification runtime: ${process.version} ${process.platform}/${process.arch}; ${availableParallelism()} CPUs`,
  )
  for (const [phase, command, args] of commands) {
    console.log(`\nVerifying: ${command} ${args.join(' ')}`)
    if (process.env.ULTIMATE_VERIFY_PHASES === '1') console.log(`Verification phase: ${phase}`)
    const result = spawnSync(command, args, { env, stdio: 'inherit', timeout: 10 * 60 * 1000 })
    if (result.error) throw result.error
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      break
    }
  }
} finally {
  rmSync(home, { recursive: true, force: true })
}
