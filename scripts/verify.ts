import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'

// #45669: verification must not inherit the host's credentials or live-server configuration.
// Resolve pnpm's normal store outside the project; a temporary store would invalidate node_modules after cleanup.
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
const commands: [string, string[]][] = [
  ['pnpm', ['install', '--frozen-lockfile', '--prefer-offline']],
  [
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
  ['pnpm', ['check']],
  ['pnpm', ['test']],
  ['pnpm', ['test:e2e']],
  [process.execPath, ['--test', '.ultimate/extensions/cursor-task/test/e2e/runner.test.ts']],
  [
    'pnpm',
    ['exec', 'vp', 'test', '--config', '.ultimate/extensions/cursor-task/test/vite.config.ts'],
  ],
  [process.execPath, ['.ultimate/extensions/deepwiki/verify.mjs', process.cwd()]],
  [process.execPath, ['.ultimate/extensions/public-docs/verify.mjs', process.cwd()]],
]
try {
  console.log(
    `Verification runtime: ${process.version} ${process.platform}/${process.arch}; ${availableParallelism()} CPUs`,
  )
  for (const [command, args] of commands) {
    console.log(`\nVerifying: ${command} ${args.join(' ')}`)
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
