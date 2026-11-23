import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const stub = `
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
childProcess.spawnSync = (command, args, { env }) => {
  if (command === 'pnpm' && args[0] === 'store') return { status: 0, stdout: '/fake-store' }
  if (Object.keys(env).sort().join(',') !== 'CI,HOME,PATH,PNPM_CONFIG_STORE_DIR,TMPDIR' ||
      env.CI !== '1' || env.HOME !== env.TMPDIR || env.PNPM_CONFIG_STORE_DIR !== '/fake-store') {
    throw new Error('Expected the isolated verification environment')
  }
  console.log('stub: ' + JSON.stringify([command === process.execPath ? 'node' : command, ...args]))
  return { status: 0 }
}
syncBuiltinESMExports()
`

function verify(...args: string[]) {
  return spawnSync(
    process.execPath,
    ['--import', `data:text/javascript,${encodeURIComponent(stub)}`, 'scripts/verify.ts', ...args],
    { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.cwd(), UNUSED: 'sentinel' } },
  )
}

function commands(...args: string[]): string[][] {
  const run = verify(...args)
  expect(run.status).toBe(0)
  return run.stdout
    .split('\n')
    .filter((line) => line.startsWith('stub: '))
    .map((line) => JSON.parse(line.slice(6)))
}

it('runs the same verification commands across the two lanes, repeating only frozen setup', () => {
  const serial = commands()
  const e2e = [['pnpm', 'test:e2e']]
  const setup = serial.filter((args) => args.includes('--frozen-lockfile'))
  expect(setup).toHaveLength(3)
  expect(serial).toContainEqual(e2e[0])
  expect(commands('fast')).toEqual(serial.filter((args) => args[1] !== 'test:e2e'))
  expect(commands('e2e')).toEqual([...setup, ...e2e])
})

it('rejects an unknown lane without running any commands', () => {
  const run = verify('unknown')
  expect(run.status).toBe(1)
  expect(run.stderr).toContain('Usage: pnpm verify [fast|e2e]')
  expect(run.stdout).toBe('')
})
