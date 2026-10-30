import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { run } from '../../runner.ts'
import type { CursorRequest } from '../../types.d.ts'

if (process.argv[4] === 'owner') {
  const child = spawn(process.execPath, [process.argv[1], process.argv[2], process.argv[3]], {
    detached: true,
    stdio: ['pipe', process.stdout, process.stderr],
  })
  child.on('error', () => {
    process.exitCode = 1
  })
} else {
  await run(JSON.parse(readFileSync(process.argv[2], 'utf8')) as CursorRequest, process.argv[3])
}
