// fast-test-reason: spawnSync is fully mocked; this regression test starts no processes.
import { spawnSync } from 'node:child_process'
import { expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn<typeof spawnSync>() }))

it('keeps pnpm on its persistent store while isolating verification from host secrets', async () => {
  vi.stubEnv('PIPELINE_PRIVATE_TOKEN', 'synthetic')
  const environments: NodeJS.ProcessEnv[] = []
  vi.mocked(spawnSync).mockImplementation((_command, _args, options) => {
    environments.push(options?.env ?? {})
    return { status: 0, stdout: '/persistent/pnpm/store/v11\n' } as never
  })
  try {
    await import('../scripts/verify.ts')
    const checks = environments.slice(1)
    expect(checks.length).toBeGreaterThan(0)
    expect(checks.map((env) => env.PNPM_CONFIG_STORE_DIR)).toEqual(
      checks.map(() => '/persistent/pnpm/store/v11'),
    )
    expect(checks.map((env) => env.PIPELINE_PRIVATE_TOKEN === undefined)).toEqual(
      checks.map(() => true),
    )
    expect(checks.map((env) => env.HOME !== process.env.HOME)).toEqual(checks.map(() => true))
  } finally {
    vi.unstubAllEnvs()
  }
})
