import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { setImmediate as yieldToLoop } from 'node:timers/promises'

type Entry = { pid: number; ppid: number; pgid: number; birth: string }
const same = (a?: Entry, b?: Entry) => !!a && !!b && a.pid === b.pid && a.birth === b.birth
function snapshot() {
  const output = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,lstart='], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 1000,
  })
  return new Map(
    output
      .trim()
      .split('\n')
      .map((line): [number, Entry] => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)
        if (!match) throw new Error('Process inventory unavailable')
        const [, pid, ppid, pgid, birth] = match
        return [+pid, { pid: +pid, ppid: +ppid, pgid: +pgid, birth }]
      }),
  )
}

/** Observed birth-matched ancestry, not a sandbox or a universal daemonization guarantee. */
export function ownedProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  failed: (reason: 'Cursor could not start.' | 'Process inventory unavailable.') => void,
) {
  const child: ChildProcessWithoutNullStreams = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const owned = new Map<number, Entry>()
  let root: Entry | undefined,
    reaped = false,
    trackingFailed = false
  let cleanup: Promise<boolean> | undefined
  const discover = (table: Map<number, Entry>) => {
    if (!root && child.pid) {
      root = table.get(child.pid)
      if (root) owned.set(root.pid, root)
    }
    let added: boolean
    do {
      added = false
      for (const entry of table.values()) {
        const parent = table.get(entry.ppid)
        if (
          !same(entry, owned.get(entry.pid)) &&
          same(parent, owned.get(entry.ppid)) &&
          Date.parse(entry.birth) >= Date.parse(parent!.birth)
        ) {
          owned.set(entry.pid, entry)
          added = true
        }
      }
    } while (added)
  }
  const send = (pid: number, signal: NodeJS.Signals) => {
    try {
      process.kill(pid, signal)
    } catch (error) {
      // Darwin may return EPERM for an exiting zombie. Only later verified absence counts.
      if (!['ESRCH', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? ''))
        trackingFailed = true
    }
  }
  const signalOwned = (table: Map<number, Entry>, signal: NodeJS.Signals) => {
    const alive = [...owned.values()].filter((entry) => same(entry, table.get(entry.pid)))
    for (const pgid of new Set(alive.map((entry) => table.get(entry.pid)!.pgid))) {
      if (
        pgid > 1 &&
        [...table.values()]
          .filter((entry) => entry.pgid === pgid)
          .every((entry) => same(entry, owned.get(entry.pid)))
      )
        send(-pgid, signal)
    }
    for (const entry of alive.toReversed()) send(entry.pid, signal)
  }
  const sample = () => {
    try {
      discover(snapshot())
    } catch {
      trackingFailed = true
      failed('Process inventory unavailable.')
    }
  }
  child.on('spawn', sample)
  child.on('error', () => {
    reaped = true
    failed('Cursor could not start.')
  })
  child.on('exit', () => {
    reaped = true
  })
  const timer = setInterval(sample, 50)
  return {
    child,
    stop() {
      return (cleanup ??= (async () => {
        clearInterval(timer)
        let verified = false
        try {
          let table = snapshot()
          discover(table) // Capture ancestry before killing parents, including separate PGIDs.
          signalOwned(table, 'SIGSTOP')
          table = snapshot()
          discover(table)
          signalOwned(table, 'SIGKILL')
          const deadline = Date.now() + 5000
          do {
            await yieldToLoop()
            table = snapshot()
            discover(table)
            if (reaped && ![...owned.values()].some((entry) => same(entry, table.get(entry.pid)))) {
              verified = !!root && !trackingFailed
              break
            }
            signalOwned(table, 'SIGKILL')
          } while (Date.now() < deadline)
        } catch {
          // Inventory failure cannot prove cleanup; still kill and reap our direct child.
          failed('Process inventory unavailable.')
          child.kill('SIGKILL')
          const deadline = Date.now() + 5000
          while (Date.now() < deadline) {
            if (reaped) break
            await yieldToLoop()
          }
        }
        child.stdin.destroy()
        child.stdout.destroy()
        child.stderr.destroy()
        child.unref()
        return verified
      })())
    },
  }
}
