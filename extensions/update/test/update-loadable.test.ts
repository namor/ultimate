import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExtensionHost } from '../../../server/extensions.ts'
import { exec } from '../../../lib/exec.ts'
import { loadable } from '../server.ts'

vi.mock('../../../lib/exec.ts', () => ({ exec: vi.fn<typeof exec>() }))
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

it('waits while index.lock exists and resolves only after its removal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ultimate-update-loadable-'))
  const index = join(root, 'index.lock')
  writeFileSync(index, '')
  vi.mocked(exec).mockResolvedValue({ stdout: index, stderr: '' })
  const host = {
    ultimateRoot: root,
    resource: (_name: string, create: () => unknown) => create(),
  } as unknown as ExtensionHost
  vi.useFakeTimers()
  const resolved = vi.fn<() => void>()
  const loading = loadable(host).then(resolved)
  try {
    await vi.advanceTimersByTimeAsync(100)
    expect(resolved).not.toHaveBeenCalled()
    unlinkSync(index)
    await vi.advanceTimersByTimeAsync(50)
    await loading
    expect(resolved).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    rmSync(root, { recursive: true, force: true })
    await vi.runAllTimersAsync()
    await loading
  }
})

it('installs an owed lockfile without a TTY after a dependency layout changes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ultimate-update-loadable-'))
  mkdirSync(join(root, 'node_modules/.pnpm'), { recursive: true })
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'new lockfile')
  writeFileSync(join(root, 'node_modules/.pnpm/lock.yaml'), 'old lockfile')
  const host = {
    ultimateRoot: root,
    extensions: () => [],
    notice: vi.fn<ExtensionHost['notice']>(),
    resource: (_name: string, create: () => unknown) => create(),
  } as unknown as ExtensionHost
  const installs: unknown[] = []
  vi.mocked(exec).mockImplementation(async (command, args, options) => {
    if (command === 'pnpm') installs.push({ args, cwd: options?.cwd, ci: options?.env?.CI })
    return { stdout: args?.[1] === '--git-path' ? join(root, args[2]) : '', stderr: '' }
  })
  try {
    await loadable(host)
    expect(installs).toEqual([{ args: ['install', '--frozen-lockfile'], cwd: root, ci: '1' }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
