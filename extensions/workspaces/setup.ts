import { exec } from '../../lib/exec.ts'

/** Run resolved setup commands in a new worktree at `path`, branched from `source`. */
export async function setup(source: string, path: string, commands: string[], signal: AbortSignal) {
  for (const command of commands) {
    signal.throwIfAborted()
    try {
      const pending = exec('sh', ['-c', command], {
        cwd: path,
        env: { ...process.env, ULTIMATE_SOURCE: source },
        signal,
        timeout: 120000,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
      })
      pending.child.stdin?.end()
      await pending
    } catch (error) {
      const output = error as Error & { stdout?: string; stderr?: string }
      throw new Error(
        `Worktree setup failed: ${command}\n${`${output.stdout ?? ''}${output.stderr ?? ''}${output.message}`.slice(-4000)}`,
        { cause: error },
      )
    }
  }
}
