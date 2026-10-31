import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Type } from '@earendil-works/pi-ai'
import { defineExtension, defineTool, section } from '@earendil-works/pi-durable'
import type { ExtensionHost } from '../../../server/extensions.ts'
import type { ActionContext } from '../../../server/actions.ts'
import type { CursorJob, CursorRequest } from './types.d.ts'

type Active = { id: string; child: ChildProcessWithoutNullStreams; done: Promise<CursorJob> }
type State = { active?: Active }
const state = (host: ExtensionHost) => host.resource<State>('cursor-task:process', () => ({}))
const readJob = (directory: string) =>
  JSON.parse(readFileSync(join(directory, 'job.json'), 'utf8')) as CursorJob
function writeJob(directory: string, job: CursorJob) {
  writeFileSync(join(directory, 'job.json.tmp'), JSON.stringify(job))
  renameSync(join(directory, 'job.json.tmp'), join(directory, 'job.json'))
}
async function cancel(active?: Active) {
  if (!active) return
  active.child.stdin.end() // EOF is the runner's owner lease; it persists results even if this host dies.
  await active.done
}
function owned(args: unknown, ctx: ActionContext) {
  const id = (args as { id?: unknown } | null)?.id
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
  )
    throw new Error('Invalid Cursor job id')
  const directory = join(ctx.host.home, 'cursor-task', id)
  const owner = JSON.parse(readFileSync(join(directory, 'owner.json'), 'utf8')) as {
    conversationId: number
  }
  if (ctx.conversationId !== owner.conversationId)
    throw new Error('Cursor job belongs to another conversation')
  return { id, directory }
}
export const actions = {
  async get(args: unknown, ctx: ActionContext): Promise<CursorJob> {
    return readJob(owned(args, ctx).directory)
  },
  async cancel(args: unknown, ctx: ActionContext): Promise<CursorJob> {
    const { id, directory } = owned(args, ctx)
    const active = state(ctx.host).active
    if (active?.id === id) await cancel(active)
    return readJob(directory)
  },
}
export default function cursorTask(host: ExtensionHost) {
  const processState = state(host)
  host.onClose(async () => {
    await cancel(processState.active)
  })
  return defineExtension({
    name: 'cursor-task',
    sections: [
      section(
        'cursor_task',
        () =>
          'cursor_task starts a fresh independent Cursor Grok 4.6 Extra High (fast=false) native coding loop from the current cwd committed HEAD. Uncommitted files are NOT copied. It has normal user access, NOT an OS sandbox. Ordinary native worktree reads/edits/tests/shell are pre-authorized once per request. Review the preserved dirty worktree and patch; never assume changes were committed or landed. History stays with Cursor. Usage and remote billing-stop are unknown. Interrupted unsafe calls are never automatically resent.',
      ),
    ],
    tools: [
      defineTool({
        name: 'cursor_task',
        replay: 'unsafe',
        description:
          'Delegate a self-contained coding task to fresh autonomous Cursor Grok 4.6 Extra High (fast=false), using its native tools and normal user access, NOT an OS sandbox. Starts from committed HEAD in a detached worktree; excludes uncommitted source changes. No automatic commit, landing or push. Waits for completion/cleanup and returns artifact paths; one active task per host, 10 minute deadline. Existing Cursor login required; no new authentication authorized.',
        parameters: Type.Object(
          { task: Type.String({ minLength: 1, maxLength: 8000 }) },
          { additionalProperties: false },
        ),
        async execute(args, api, context) {
          if (processState.active) throw new Error('A Cursor task is already active on this host')
          if (!args.task.trim()) throw new Error('Task must not be blank')
          context.abortSignal?.throwIfAborted()
          // Discovery is authoritative at call time: Vite's bundled import.meta.url is not a runner location.
          const extension = host.extensions().find((item) => item.name === 'cursor-task')
          if (!extension) throw new Error('Cursor task extension path unavailable')
          const id = randomUUID(),
            directory = join(host.home, 'cursor-task', id)
          mkdirSync(directory, { recursive: true })
          const request: CursorRequest = {
            directory,
            source: api.env?.cwd ?? host.projectRoot,
            task: args.task,
          }
          writeFileSync(join(directory, 'request.json'), JSON.stringify(request))
          writeFileSync(
            join(directory, 'owner.json'),
            JSON.stringify({ conversationId: api.conversationId }),
          )
          let latest: CursorJob = {
            id,
            task: args.task,
            status: 'starting',
            source: request.source,
            worktree: join(directory, 'worktree'),
            base: '',
            model: 'grok-4.6[effort=xhigh,fast=false]',
            startedAt: Date.now(),
            activity: 'Starting runner',
            nativeCalls: 0,
            resultPath: join(directory, 'result.md'),
            patchPath: join(directory, 'changes.patch'),
            summary: '',
            diffStat: '',
          }
          writeJob(directory, latest)
          const child = spawn(
            process.execPath,
            [join(extension.path, 'runner.ts'), join(directory, 'request.json')],
            {
              detached: true,
              stdio: ['pipe', 'pipe', 'pipe'],
              env: { PATH: process.env.PATH, HOME: homedir(), TMPDIR: tmpdir() },
            },
          )
          child.stdin.on('error', () => {
            /* Runner exit closes its owner lease; close handler reads durable status. */
          })
          child.stderr.resume() // Never return or persist raw runner/CLI diagnostics.
          let details = Promise.resolve()
          createInterface({ input: child.stdout }).on('line', (line) => {
            details = details.then(async () => {
              try {
                const job = JSON.parse(line) as CursorJob
                if (job?.id === id) latest = job
                await api.details(job, context)
              } catch {
                // A canceled tool context cannot accept details; the independent runner still finalizes on disk.
              }
            })
          })
          let resolveDone!: (job: CursorJob) => void
          const done = new Promise<CursorJob>((resolve) => {
            resolveDone = resolve
          })
          const active = { id, child, done }
          processState.active = active
          const complete = () => {
            let job: CursorJob | undefined
            try {
              const saved = readJob(directory)
              if (saved?.id === id && ['complete', 'interrupted', 'failed'].includes(saved.status))
                job = saved
            } catch {
              // Missing/corrupt artifacts must not throw from the child event into the host.
            }
            if (!job) {
              job = {
                ...latest,
                status: 'interrupted',
                endedAt: Date.now(),
                activity: 'Interrupted; cleanup unverified',
                error:
                  'Runner exited without a terminal artifact. Local cleanup is unverified; review preserved artifacts.',
              }
              try {
                writeJob(directory, job)
              } catch {
                // Disk failure cannot prevent returning the explicit in-memory interrupted result.
              }
            }
            if (processState.active === active) processState.active = undefined
            resolveDone(job)
          }
          child.on('error', () => {
            /* Spawn failure also emits close; complete records an explicit interruption. */
          })
          child.once('close', complete)
          const abort = () => {
            child.stdin.end()
          }
          context.abortSignal?.addEventListener('abort', abort, { once: true })
          try {
            const job = await done
            await details
            try {
              await api.details(job, context)
            } catch {
              // The canceled context may be gone; terminal status is still returned and persisted when possible.
            }
            return {
              output: [
                {
                  type: 'text' as const,
                  text: `${job.status}: ${job.id}${job.error ? `\n${job.error}` : ''}\nWorktree: ${job.worktree}\nResult: ${job.resultPath}\nPatch: ${job.patchPath}\nUsage unknown. Review changes; nothing committed or landed.`,
                },
              ],
            }
          } finally {
            context.abortSignal?.removeEventListener('abort', abort)
          }
        },
      }),
    ],
  })
}
