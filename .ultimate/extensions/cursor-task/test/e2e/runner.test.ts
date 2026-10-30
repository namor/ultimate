import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { CursorJob } from '../../types.d.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fake = join(here, 'fake-cursor.mjs')
chmodSync(fake, 0o755)
function fixture(effort?: string) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'cursor-task-test-')))
  const source = join(directory, 'source'),
    job = join(directory, 'job')
  mkdirSync(source)
  mkdirSync(job)
  const git = (args: string[]) => execFileSync('git', args, { cwd: source, stdio: 'pipe' })
  git(['init', '-q'])
  writeFileSync(join(source, 'clamp.mjs'), 'export const clamp = n => n\n')
  writeFileSync(
    join(source, 'clamp.test.mjs'),
    'import assert from "node:assert/strict"; import { clamp } from "./clamp.mjs"; assert.equal(clamp(-1), 0)\n',
  )
  if (effort !== undefined) writeFileSync(join(source, 'effort.txt'), effort)
  git(['add', '.'])
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'fixture',
  ])
  writeFileSync(join(source, 'dirty.txt'), 'not copied')
  return { directory, source, job }
}
function launch(
  setup: ReturnType<typeof fixture>,
  task: string,
  mode = '',
  nodeArgs: string[] = [],
) {
  const request = join(setup.job, 'request.json')
  writeFileSync(request, JSON.stringify({ directory: setup.job, source: setup.source, task }))
  // Absolute fake executable is injected only through the test launcher; never resolve a real Cursor CLI.
  const child = spawn(
    process.execPath,
    [...nodeArgs, join(here, 'launch.ts'), request, fake, mode],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  let diagnostics = ''
  child.stderr.setEncoding('utf8').on('data', (value) => {
    diagnostics += value
  })
  const lines = createInterface({ input: child.stdout })
  const jobs: CursorJob[] = []
  let ready!: () => void
  const holding = new Promise<void>((resolve) => {
    ready = resolve
  })
  lines.on('line', (line) => {
    const job = JSON.parse(line) as CursorJob
    jobs.push(job)
    if (job.summary === 'Holding native child') ready()
  })
  // Stream end includes the runner even when its owner dies: the runner inherited the output pipe.
  const ended = new Promise<void>((resolve) => lines.on('close', resolve))
  const closed = new Promise<number | null>((resolve) => child.on('close', resolve))
  return { child, jobs, holding, ended, closed, diagnostics: () => diagnostics }
}

await test(
  'symlinked runner entrypoint persists Failed for a blank task without Cursor',
  { timeout: 30000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cursor-task-entry-'))
    try {
      const entry = join(directory, 'entry.ts'),
        request = join(directory, 'request.json'),
        jobDirectory = join(directory, 'job')
      symlinkSync(join(here, '../../runner.ts'), entry)
      writeFileSync(
        request,
        JSON.stringify({ directory: jobDirectory, source: directory, task: '' }),
      )
      // Blank task fails before git/ACP; an empty command search path also prevents any real CLI launch.
      const child = spawn(process.execPath, [entry, request], {
        stdio: 'ignore',
        env: { PATH: directory },
      })
      const code = await new Promise<number | null>((resolve) => child.on('close', resolve))
      const job = JSON.parse(readFileSync(join(jobDirectory, 'job.json'), 'utf8')) as CursorJob
      assert.equal(job.status, 'failed')
      assert.equal(code, 1)
      assert.equal(job.base, '')
      assert.equal(job.sessionId, undefined)
      assert.equal(job.nativeCalls, 0)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)

await test(
  'fresh native completion includes tracked/untracked patch and full split multibyte output',
  { timeout: 30000 },
  async () => {
    const setup = fixture()
    try {
      const run = launch(setup, 'fix')
      assert.equal(await run.closed, 0, run.diagnostics() + JSON.stringify(run.jobs.at(-1)))
      const job = JSON.parse(readFileSync(join(setup.job, 'job.json'), 'utf8')) as CursorJob
      assert.equal(job.status, 'complete', JSON.stringify(job))
      assert.equal(job.nativeCalls, 1)
      const expected =
        'x'.repeat(20000) +
        '🦊漢é\nAuthentication required is a coding feature, not a login request.'
      assert.equal(readFileSync(job.resultPath, 'utf8'), expected)
      assert.equal(job.summary.length, 2000)
      const patch = readFileSync(job.patchPath, 'utf8')
      assert.match(patch, /Math.max/)
      assert.match(patch, /new.mjs/)
      assert.match(patch, /🦊漢é/)
      assert.equal(
        readFileSync(join(setup.source, 'clamp.mjs'), 'utf8'),
        'export const clamp = n => n\n',
      )
      assert.throws(() => readFileSync(join(job.worktree, 'dirty.txt')))
      execFileSync(process.execPath, ['--test', 'clamp.test.mjs'], {
        cwd: job.worktree,
        env: { PATH: process.env.PATH },
      })
      assert.ok(run.jobs.some((entry) => entry.status === 'running'))
      assert.equal(run.jobs.at(-1)?.status, 'complete')
    } finally {
      rmSync(setup.directory, { recursive: true, force: true })
    }
  },
)

await test(
  'refuses a Grok session without Extra High effort before sending a prompt',
  { timeout: 30000 },
  async () => {
    const setup = fixture('high')
    try {
      const run = launch(setup, 'fix')
      assert.equal(await run.closed, 1, run.diagnostics())
      const job = JSON.parse(readFileSync(join(setup.job, 'job.json'), 'utf8')) as CursorJob
      assert.equal(job.status, 'failed')
      assert.equal(job.model, 'cursor-grok-4.6-xhigh')
      assert.match(job.error ?? '', /effort=xhigh and fast=false; no task sent/)
      assert.equal(job.nativeCalls, 0)
      assert.throws(() => readFileSync(join(job.worktree, '.prompt-sent')))
      assert.throws(() => readFileSync(join(job.worktree, '.native.json')))
    } finally {
      rmSync(setup.directory, { recursive: true, force: true })
    }
  },
)

await test(
  'Cursor todo metadata is acknowledged before the native coding loop continues',
  { timeout: 30000 },
  async () => {
    const setup = fixture()
    try {
      const run = launch(setup, 'todos')
      assert.equal(await run.closed, 0, run.diagnostics() + JSON.stringify(run.jobs.at(-1)))
      const job = JSON.parse(readFileSync(join(setup.job, 'job.json'), 'utf8')) as CursorJob
      assert.equal(job.status, 'complete')
      assert.equal(job.nativeCalls, 1)
      assert.equal(readFileSync(join(job.worktree, '.todo-accepted'), 'utf8'), 'yes')
      const patch = readFileSync(job.patchPath, 'utf8')
      assert.match(patch, /Math.max/)
      assert.doesNotMatch(
        JSON.stringify({ job, streamed: run.jobs, diagnostics: run.diagnostics() }) +
          readFileSync(job.resultPath, 'utf8') +
          patch,
        /SYNTHETIC_TODO/,
      )
      execFileSync(process.execPath, ['--test', 'clamp.test.mjs'], {
        cwd: job.worktree,
        env: { PATH: process.env.PATH },
      })
    } finally {
      rmSync(setup.directory, { recursive: true, force: true })
    }
  },
)

await test(
  'invalid Cursor todo metadata is rejected without exposing its payload',
  { timeout: 30000 },
  async () => {
    const setup = fixture()
    try {
      const run = launch(setup, 'invalid-todos')
      assert.equal(await run.closed, 1, run.diagnostics())
      const job = JSON.parse(readFileSync(join(setup.job, 'job.json'), 'utf8')) as CursorJob
      assert.equal(job.status, 'failed')
      assert.equal(job.error, 'Invalid Cursor todo metadata; task stopped.')
      assert.equal(job.nativeCalls, 0)
      assert.equal(readFileSync(join(job.worktree, '.todo-rejected'), 'utf8'), 'yes')
      assert.doesNotMatch(
        JSON.stringify({ job, streamed: run.jobs, diagnostics: run.diagnostics() }) +
          readFileSync(job.resultPath, 'utf8') +
          readFileSync(job.patchPath, 'utf8'),
        /SYNTHETIC_TODO|SYNTHETIC_INVALID_STATUS/,
      )
    } finally {
      rmSync(setup.directory, { recursive: true, force: true })
    }
  },
)

await test(
  'unsupported addressed requests retain only their method while still denying client execution',
  { timeout: 30000 },
  async () => {
    const setup = fixture()
    try {
      const run = launch(setup, 'unsupported')
      assert.equal(await run.closed, 1, run.diagnostics())
      const job = JSON.parse(readFileSync(join(setup.job, 'job.json'), 'utf8')) as CursorJob
      assert.equal(job.status, 'failed')
      assert.equal(
        job.error,
        'Unexpected client execution or interactive request (method=fs/read_text_file); task stopped.',
      )
      assert.equal(readFileSync(join(job.worktree, '.request-denied'), 'utf8'), '-32601')
      assert.equal(readFileSync(job.resultPath, 'utf8'), '')
      assert.doesNotMatch(
        JSON.stringify({ job, streamed: run.jobs, diagnostics: run.diagnostics() }),
        /SYNTHETIC_SECRET/,
      )
      assert.doesNotMatch(readFileSync(job.patchPath, 'utf8'), /SYNTHETIC_SECRET/)
    } finally {
      rmSync(setup.directory, { recursive: true, force: true })
    }
  },
)

await test(
  'inventory failure retains sanitized cause and cleanup warning while killing the fake root',
  { timeout: 30000 },
  async () => {
    const setup = fixture()
    try {
      const preload = join(setup.directory, 'inventory-failure.mjs')
      writeFileSync(
        preload,
        `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const original = childProcess.execFileSync;
childProcess.execFileSync = (command, ...args) => {
  if (command === '/bin/ps') throw new Error('SENSITIVE_INVENTORY_SENTINEL');
  return original(command, ...args);
};
syncBuiltinESMExports();\n`,
      )
      const run = launch(setup, 'inventory', '', ['--import', preload])
      assert.equal(await run.closed, 1, run.diagnostics())
      const job = JSON.parse(readFileSync(join(setup.job, 'job.json'), 'utf8')) as CursorJob
      assert.equal(job.status, 'failed')
      assert.match(job.error ?? '', /Process inventory unavailable/)
      assert.match(job.error ?? '', /Local process cleanup could not be verified/)
      assert.doesNotMatch(JSON.stringify(job), /SENSITIVE_INVENTORY_SENTINEL/)
      assert.ok(job.base)
      assert.equal(job.sessionId, undefined)
      assert.equal(job.nativeCalls, 0)
      const pid = Number(readFileSync(join(job.worktree, '.cursor.pid'), 'utf8'))
      assert.ok(Number.isInteger(pid) && pid > 0)
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
      assert.throws(() => readFileSync(join(job.worktree, '.native.json')))
    } finally {
      rmSync(setup.directory, { recursive: true, force: true })
    }
  },
)

for (const mode of ['cancel', 'owner']) {
  await test(
    `${mode}: Interrupted persists and separate-PGID native child is gone without resend`,
    { timeout: 30000 },
    async () => {
      const setup = fixture()
      try {
        const run = launch(setup, 'hold', mode === 'owner' ? mode : '')
        await run.holding
        const ids = JSON.parse(readFileSync(join(setup.job, 'worktree/.native.json'), 'utf8')) as {
          root: number
          leaf: number
        }
        const group = (pid: number) =>
          execFileSync('/bin/ps', ['-p', String(pid), '-o', 'pgid='], { encoding: 'utf8' }).trim()
        assert.notEqual(group(ids.root), group(ids.leaf))
        if (mode === 'owner') run.child.kill('SIGKILL')
        else run.child.stdin.write('cancel\n')
        await run.ended
        await run.closed
        const job = JSON.parse(readFileSync(join(setup.job, 'job.json'), 'utf8')) as CursorJob
        assert.equal(job.status, 'interrupted', JSON.stringify(job))
        assert.equal(job.nativeCalls, 1)
        assert.equal(readFileSync(job.resultPath, 'utf8'), 'Holding native child')
        assert.equal(readFileSync(join(job.worktree, '.cancel-received'), 'utf8'), 'yes')
        assert.match(readFileSync(job.patchPath, 'utf8'), /.native.json/)
        for (const pid of [ids.root, ids.leaf])
          assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
        assert.equal(run.jobs.at(-1)?.status, 'interrupted')
      } finally {
        rmSync(setup.directory, { recursive: true, force: true })
      }
    },
  )
}
