import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve as resolvePath } from 'node:path'
import { createInterface } from 'node:readline'
import { StringDecoder } from 'node:string_decoder'
import { ownedProcess } from './process.ts'
import type { CursorJob, CursorRequest } from './types.d.ts'

type Call = {
  toolCallId?: string
  title?: string
  kind?: string
  locations?: { path?: string }[]
  rawInput?: Record<string, unknown>
}
type Config = { id: string; currentValue?: string }
type Result = {
  sessionId?: string
  stopReason?: string
  configOptions?: Config[]
  models?: { currentModelId?: string }
  modes?: { currentModeId?: string }
}
type Message = {
  id?: number
  method?: string
  result?: Result
  error?: unknown
  params?: {
    toolCall?: Call
    options?: { kind: string; optionId: string }[]
    update?: Call & { sessionUpdate: string; content?: { type: string; text?: string } }
  }
}
const outputLimit = 128 * 1024,
  patchLimit = 4 * 1024 * 1024
const authError =
  'Existing Cursor login unavailable; authenticate separately. No browser or new login is authorized.'
function todoMetadata(params: unknown) {
  if (!params || typeof params !== 'object') return undefined
  const { toolCallId, todos, merge } = params as Record<string, unknown>
  if (
    typeof toolCallId !== 'string' ||
    toolCallId.length > 256 ||
    typeof merge !== 'boolean' ||
    !Array.isArray(todos) ||
    todos.length > 100
  )
    return undefined
  const accepted: { id: string; content: string; status: string }[] = []
  let bytes = 0
  for (const item of todos) {
    if (!item || typeof item !== 'object') return undefined
    const { id, content, status } = item as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      id.length > 256 ||
      typeof content !== 'string' ||
      content.length > 4096 ||
      typeof status !== 'string' ||
      !['pending', 'in_progress', 'completed', 'cancelled'].includes(status)
    )
      return undefined
    bytes += Buffer.byteLength(id) + Buffer.byteLength(content)
    if (bytes > 64 * 1024) return undefined
    accepted.push({ id, content, status })
  }
  return accepted
}
function canonical(path: string): string {
  if (existsSync(path)) return realpathSync(path)
  const parent = dirname(path)
  return parent === path ? path : join(canonical(parent), relative(parent, path))
}
/** Missing rawInput is normal ACP, not a reason to reject ordinary native tools. */
export function permit(call: Call, cwd: string) {
  const inside = (path: string) => {
    const part = relative(canonical(cwd), canonical(resolvePath(cwd, path)))
    return part !== '..' && !part.startsWith('../') && !isAbsolute(part)
  }
  const paths = (value: unknown): string[] => {
    if (!value || typeof value !== 'object') return []
    return Object.entries(value).flatMap(([key, item]) =>
      /^(?:path|filePath|file_path|cwd|directory)$/.test(key) && typeof item === 'string'
        ? [item]
        : paths(item),
    )
  }
  if (
    [
      ...(call.locations ?? []).flatMap((item) => (item.path ? [item.path] : [])),
      ...paths(call.rawInput),
    ].some((path) => !inside(path))
  )
    return false
  if (!['read', 'edit', 'search', 'execute'].includes(call.kind ?? '')) return false
  if (
    /^\s*(?:MCP[:\s]|mcp__|Sign in\b|Log in\b)/i.test(call.title ?? '') ||
    call.rawInput?.mcpServer ||
    call.rawInput?.mcp_server
  )
    return false
  const command = call.rawInput?.command
  // Observable host-destructive/global operations are refused; arbitrary native shell is still trusted user access.
  return (
    typeof command !== 'string' ||
    !/(?:^|[\n;&|])\s*(?:sudo\b|git\s+(?:push|commit)\b|diskutil\b|mkfs\b|(?:cursor-agent|agent)\s+(?:login|logout)\b|rm\s+-[^\n]*\s+\/(?:\s|$|Users|System))/i.test(
      command,
    )
  )
}
export function cleanEnvironment(directory: string): NodeJS.ProcessEnv {
  return {
    PATH: [
      join(homedir(), '.local/bin'),
      dirname(process.execPath),
      process.env.PATH ?? '/usr/bin:/bin',
    ].join(':'),
    HOME: homedir(),
    TMPDIR: tmpdir(),
    NO_OPEN_BROWSER: '1',
    CURSOR_CONFIG_DIR: join(directory, 'config'),
    CURSOR_DATA_DIR: join(directory, 'data'),
    NODE_COMPILE_CACHE: join(directory, 'cache'),
  }
}
export function saveJob(directory: string, job: CursorJob) {
  writeFileSync(join(directory, 'job.json.tmp'), JSON.stringify(job))
  renameSync(join(directory, 'job.json.tmp'), join(directory, 'job.json'))
}
export async function run(request: CursorRequest, command = 'cursor-agent') {
  const { directory, source, task } = request
  mkdirSync(directory, { recursive: true })
  const job: CursorJob = {
    id: directory.split('/').pop()!,
    task,
    status: 'starting',
    source,
    worktree: join(directory, 'worktree'),
    base: '',
    model: 'cursor-grok-4.6-xhigh',
    startedAt: Date.now(),
    activity: 'Preparing committed HEAD (uncommitted files are not copied)',
    nativeCalls: 0,
    resultPath: join(directory, 'result.md'),
    patchPath: join(directory, 'changes.patch'),
    summary: '',
    diffStat: '',
  }
  let outputBytes = 0,
    session: string | undefined,
    stopping: Promise<void> | undefined
  let interrupted = false,
    failure: string | undefined,
    finished = false,
    serial = 0
  let target: ReturnType<typeof ownedProcess> | undefined
  const pending = new Map<number, { resolve: (result: Result) => void; reject: () => void }>()
  const calls = new Map<string, Call>()
  const publish = () => {
    saveJob(directory, job)
    if (!process.stdout.destroyed) process.stdout.write(`${JSON.stringify(job)}\n`)
  }
  const send = (message: unknown) => {
    if (target?.child.stdin.writable) target.child.stdin.write(`${JSON.stringify(message)}\n`)
  }
  const notifyCancel = () => {
    if (session) send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: session } })
  }
  const stop = (error?: string, cancel = false) => {
    if (finished) return
    failure ??= error
    interrupted ||= cancel
    stopping ??= (async () => {
      let verified = !target
      try {
        notifyCancel()
        // Allow cooperative cancellation before verifying observed local processes are gone.
        if (target) await new Promise((resolve) => setTimeout(resolve, 250))
        if (target) verified = await target.stop()
      } catch {
        verified = false
      } finally {
        if (!verified)
          failure = [failure, 'Local process cleanup could not be verified.']
            .filter(Boolean)
            .join(' ')
        for (const item of pending.values()) item.reject()
        pending.clear()
      }
    })()
  }
  const owner = createInterface({ input: process.stdin })
  owner.on('line', () => {
    stop(undefined, true)
  })
  owner.on('close', () => {
    stop(undefined, true)
  })
  const onSignal = () => {
    stop(undefined, true)
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, onSignal)
  process.stdout.on('error', onSignal)
  const deadline = setTimeout(
    () => {
      stop('Job exceeded the 10 minute deadline.')
    },
    10 * 60 * 1000,
  )
  const git = (args: string[], cwd = job.worktree, maxBuffer = patchLimit) =>
    execFileSync('git', args, {
      cwd,
      env: cleanEnvironment(directory),
      encoding: 'utf8',
      maxBuffer,
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  writeFileSync(job.resultPath, '')
  writeFileSync(job.patchPath, '')
  publish()
  try {
    if (
      typeof task !== 'string' ||
      !task.trim() ||
      task.length > 8000 ||
      !isAbsolute(source) ||
      !isAbsolute(directory)
    )
      throw new Error('Invalid request')
    job.base = git(['rev-parse', '--verify', 'HEAD'], source).trim()
    git(['worktree', 'add', '--detach', job.worktree, job.base], source)
    job.worktree = realpathSync(job.worktree)
    for (const name of ['config', 'data', 'cache'])
      mkdirSync(join(directory, name), { recursive: true })
    target = ownedProcess(
      command,
      ['--disable-auto-update', '--model', job.model, 'acp'],
      job.worktree,
      cleanEnvironment(directory),
      (reason) => {
        stop(reason)
      },
    )
    target.child.stdin.on('error', () => {
      if (!stopping) stop('Cursor input closed unexpectedly.')
    })
    target.child.on('exit', () => {
      if (!stopping) stop('Cursor exited before completing the task.')
    })
    const decoder = new StringDecoder('utf8')
    let stderr = '',
      stderrBytes = 0
    target.child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length
      stderr += decoder.write(chunk)
      if (
        /authentication[ _-]+required|not authenticated|login[ _-]+required|please (?:log in|sign in|authenticate)|failed to open browser|(?:open|launch)[^\n]{0,80}browser|keychain[^\n]{0,40}(?:confirm|allow|access)|billing[ _-]+authorization/i.test(
          stderr,
        )
      )
        stop(authError)
      else if (stderrBytes > 1024 * 1024) stop('Cursor diagnostic output exceeded its limit.')
      stderr = stderr.slice(-4096)
    })
    target.child.stderr.on('error', () => {
      stop('Cursor diagnostic stream failed.')
    })
    const rpc = (method: string, params: unknown): Promise<Result> =>
      new Promise((resolve, reject) => {
        if (stopping) {
          reject(new Error('Stopped'))
          return
        }
        const id = ++serial
        pending.set(id, { resolve, reject: () => reject(new Error('Cursor request failed')) })
        send({ jsonrpc: '2.0', id, method, params })
      })
    const handle = (message: Message) => {
      if (message.id !== undefined && !message.method) {
        const item = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) {
          // Only operational RPC errors are classified; never scan arbitrary coding/tool text for auth words.
          const raw = JSON.stringify(message.error)
          failure = /auth|login|browser|keychain/i.test(raw)
            ? authError
            : 'Cursor RPC request failed.'
          item?.reject()
        } else item?.resolve(message.result ?? {})
      } else if (message.method === 'session/update') {
        const update = message.params?.update
        if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
          const text = update.content.text ?? ''
          if (outputBytes + Buffer.byteLength(text) > outputLimit) {
            stop('Assistant output exceeded 128 KiB; partial result preserved.')
            return
          }
          appendFileSync(job.resultPath, text)
          outputBytes += Buffer.byteLength(text)
          job.summary = (job.summary + text).slice(0, 2000)
        } else if (
          update &&
          ['tool_call', 'tool_call_update'].includes(update.sessionUpdate) &&
          update.toolCallId
        ) {
          calls.set(update.toolCallId, { ...calls.get(update.toolCallId), ...update })
          job.nativeCalls = calls.size
          job.activity = `Native ${calls.get(update.toolCallId)?.kind ?? 'tool'} activity`
          if (
            update.locations?.some(
              (item) => item.path && !permit({ kind: 'read', locations: [item] }, job.worktree),
            )
          )
            stop('Native tool reported a location outside the assigned worktree.')
        }
        publish()
      } else if (message.method === 'cursor/update_todos') {
        // https://cursor.com/docs/cli/acp — receipt of Cursor-owned metadata, never a Pi plan mutation.
        const todos = todoMetadata(message.params)
        if (message.id !== undefined)
          send({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              outcome: todos
                ? { outcome: 'accepted', todos }
                : { outcome: 'rejected', reason: 'Invalid Cursor todo metadata' },
            },
          })
        if (!todos) stop('Invalid Cursor todo metadata; task stopped.')
      } else if (message.id !== undefined) {
        if (message.method === 'session/request_permission') {
          const call = message.params?.toolCall
          const merged = { ...calls.get(call?.toolCallId ?? ''), ...call }
          const allowed = !stopping && permit(merged, job.worktree)
          const option = message.params?.options?.find(
            (item) => item.kind === (allowed ? 'allow_once' : 'reject_once'),
          )
          send({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              outcome: option
                ? { outcome: 'selected', optionId: option.optionId }
                : { outcome: 'cancelled' },
            },
          })
          if (!allowed || !option) stop('Unexpected native permission request; task stopped.')
        } else {
          send({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32601,
              message: 'Client execution and interactive authentication are not supported',
            },
          })
          const method =
            typeof message.method === 'string' &&
            message.method.length <= 96 &&
            /^[a-zA-Z]/.test(message.method) &&
            !/[^a-zA-Z0-9_/]/.test(message.method)
              ? message.method
              : 'unknown'
          stop(
            `Unexpected client execution or interactive request (method=${method}); task stopped.`,
          )
        }
      }
    }
    let bytes = 0,
      buffer = ''
    const stdoutDecoder = new StringDecoder('utf8')
    target.child.stdout.on('data', (chunk: Buffer) => {
      if (stopping) return
      bytes += chunk.length
      if (bytes > 16 * 1024 * 1024) {
        stop('Cursor protocol output exceeded 16 MiB.')
        return
      }
      buffer += stdoutDecoder.write(chunk)
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        if (stopping) break
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        try {
          handle(JSON.parse(line) as Message)
        } catch {
          stop('Invalid Cursor protocol message.')
        }
      }
    })
    target.child.stdout.on('error', () => {
      stop('Cursor protocol stream failed.')
    })
    await rpc('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
        _meta: { parameterizedModelPicker: true },
      },
      clientInfo: { name: 'ultimate-cursor-task', version: '1' },
    })
    await rpc('authenticate', { methodId: 'cursor_login' })
    const created = await rpc('session/new', { cwd: job.worktree, mcpServers: [] })
    session = created.sessionId
    if (!session) throw new Error('Missing session')
    job.sessionId = session
    const config = created.configOptions ?? []
    const model =
      config.find((item) => item.id === 'model')?.currentValue ?? created.models?.currentModelId
    const effort = config.find((item) => item.id === 'effort')?.currentValue
    const fast = config.find((item) => item.id === 'fast')?.currentValue
    if (model !== 'grok-4.6' || effort !== 'xhigh' || fast !== 'false') {
      failure = 'Cursor did not advertise Grok 4.6 with effort=xhigh and fast=false; no task sent.'
      throw new Error('Model mismatch')
    }
    if (
      (created.modes?.currentModeId ?? config.find((item) => item.id === 'mode')?.currentValue) !==
      'agent'
    )
      await rpc('session/set_mode', { sessionId: session, modeId: 'agent' })
    job.status = 'running'
    job.activity = 'Cursor owns the native coding loop'
    publish()
    const result = await rpc('session/prompt', {
      sessionId: session,
      prompt: [
        {
          type: 'text',
          text: `Work only in ${job.worktree}. Read, edit and test code there using your native tools. Do not commit, push, change global settings, inspect credentials, start new authentication or MCP, or cause destructive effects outside this worktree. This is normal user access, NOT an OS sandbox. Uncommitted source files were not copied. Report what changed and verification.\n\n${task}`,
        },
      ],
    })
    if (result.stopReason !== 'end_turn') {
      if (result.stopReason === 'cancelled') interrupted = true
      else failure ??= 'Cursor stopped without completing the task.'
    }
  } catch {
    // RPC/process/git errors can contain account data, URLs or environment values; persist fixed messages only.
    if (!interrupted) failure ??= 'Cursor task failed; partial artifacts preserved.'
  } finally {
    stop()
    await stopping
    if (existsSync(join(job.worktree, '.git'))) {
      let patchCaptured = false
      try {
        git(['add', '-N', '--', '.']) // Include untracked, unignored code without a commit.
        writeFileSync(job.patchPath, git(['diff', '--binary', 'HEAD']))
        patchCaptured = true
        job.diffStat = git(['diff', '--stat', 'HEAD'], job.worktree, 64 * 1024).trim()
      } catch (error) {
        // Preserve bounded partial patch output on overflow, never label a truncated patch complete.
        const partial = (error as { stdout?: string }).stdout
        if (!patchCaptured && typeof partial === 'string')
          writeFileSync(job.patchPath, Buffer.from(partial).subarray(0, patchLimit))
        failure = [
          failure,
          'Patch capture failed or exceeded 4 MiB; worktree preserved for review.',
        ]
          .filter(Boolean)
          .join(' ')
      }
    }
    job.status = failure ? 'failed' : interrupted ? 'interrupted' : 'complete'
    job.error = failure
    job.endedAt = Date.now()
    job.activity = failure
      ? 'Failed; partial artifacts preserved'
      : interrupted
        ? 'Interrupted; local cleanup verified'
        : 'Complete; local cleanup verified'
    finished = true
    clearTimeout(deadline)
    publish()
    owner.close()
    process.stdin.destroy()
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.off(signal, onSignal)
    process.exitCode = job.status === 'failed' ? 1 : 0
  }
}
if (import.meta.main) {
  const request = JSON.parse(readFileSync(process.argv[2], 'utf8')) as CursorRequest
  await run(request)
}
