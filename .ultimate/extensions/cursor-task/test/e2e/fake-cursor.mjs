#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.deepEqual(process.argv.slice(2), [
  '--disable-auto-update',
  '--model',
  'grok-4.6[effort=xhigh,fast=false]',
  'acp',
])
writeFileSync('.cursor.pid', String(process.pid))
const send = (value) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n')
const update = (value) => send({ method: 'session/update', params: { update: value } })
let promptId,
  hold = false,
  leaf,
  todoParams,
  scopeTask
// Real regression: permission omits rawInput AND kind; prior native context supplies kind.
const permission = () =>
  send({
    id: 900,
    method: 'session/request_permission',
    params: {
      toolCall: { toolCallId: 'native' },
      options: [
        { kind: 'allow_once', optionId: 'once' },
        { kind: 'allow_always', optionId: 'global' },
        { kind: 'reject_once', optionId: 'no' },
      ],
    },
  })
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    assert.equal(message.params.clientCapabilities.terminal, false)
    assert.equal(message.params.clientCapabilities.fs.readTextFile, false)
    // ACP uses this protocol-defined key.
    // oxlint-disable-next-line no-underscore-dangle
    assert.equal(message.params.clientCapabilities._meta.parameterizedModelPicker, true)
    send({ id: message.id, result: {} })
  } else if (message.method === 'authenticate') {
    assert.equal(message.params.methodId, 'cursor_login')
    send({ id: message.id, result: {} })
  } else if (message.method === 'session/new') {
    assert.deepEqual(message.params.mcpServers, [])
    assert.equal(message.params.cwd, process.cwd())
    send({
      id: message.id,
      result: {
        sessionId: 'fresh',
        configOptions: [
          { id: 'model', currentValue: 'grok-4.6' },
          {
            id: 'effort',
            currentValue: existsSync('effort.txt') ? readFileSync('effort.txt', 'utf8') : 'xhigh',
          },
          {
            id: 'fast',
            currentValue: existsSync('fast.txt') ? readFileSync('fast.txt', 'utf8') : 'false',
          },
        ],
        modes: { currentModeId: 'agent' },
      },
    })
  } else if (message.method === 'session/prompt') {
    writeFileSync('.prompt-sent', 'yes')
    promptId = message.id
    if (message.params.prompt[0].text.endsWith('unsupported')) {
      send({
        id: 901,
        method: existsSync('method.json')
          ? JSON.parse(readFileSync('method.json', 'utf8'))
          : 'fs/read_text_file',
        params: { path: 'SYNTHETIC_SECRET_PATH', token: 'SYNTHETIC_SECRET_TOKEN' },
      })
      return
    }
    if (message.params.prompt[0].text.endsWith('todos')) {
      todoParams = existsSync('todos.json')
        ? JSON.parse(readFileSync('todos.json', 'utf8'))
        : {
            toolCallId: 'call_125',
            todos: [{ id: '1', content: 'SYNTHETIC_TODO_CONTENT', status: 'pending' }],
            merge: true,
            extra: 'SYNTHETIC_TODO_EXTRA',
          }
      if (message.params.prompt[0].text.endsWith('invalid-todos'))
        todoParams.todos[0].status = 'SYNTHETIC_INVALID_STATUS'
      send({ id: 0, method: 'cursor/update_todos', params: todoParams })
      return
    }
    scopeTask = message.params.prompt[0].text.split('\n').at(-1)
    if (scopeTask.endsWith('-scope')) {
      const source = dirname(
        execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
          encoding: 'utf8',
        }).trim(),
      )
      const outside = join(source, 'SYNTHETIC_SECRET_PATH.ts')
      const inside = join(process.cwd(), 'clamp.mjs')
      const partial = scopeTask === 'null-scope'
      if (scopeTask === 'symlink-scope') symlinkSync(source, join(process.cwd(), 'scope-link'))
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'native',
        kind: 'edit',
        status: 'pending',
        title: 'SYNTHETIC_SECRET_TITLE',
        locations: [{ path: partial || scopeTask === 'malformed-scope' ? inside : outside }],
        ...(partial ? { rawInput: { path: outside } } : {}),
      })
      if (partial)
        update({ sessionUpdate: 'tool_call_update', toolCallId: 'native', rawInput: null })
      send({
        id: 900,
        method: 'session/request_permission',
        params: {
          toolCall: partial
            ? { toolCallId: 'native', rawInput: null }
            : {
                toolCallId: 'native',
                locations: [
                  {
                    path:
                      scopeTask === 'outside-scope'
                        ? outside
                        : scopeTask === 'malformed-scope'
                          ? pathToFileURL(outside).href
                          : scopeTask === 'symlink-scope'
                            ? process.cwd() + '/scope-link/../SYNTHETIC_SECRET_PATH.ts'
                            : inside,
                  },
                ],
              },
          options: [
            { kind: 'allow_once', optionId: 'once' },
            { kind: 'reject_once', optionId: 'no' },
          ],
        },
      })
      return
    }
    hold = message.params.prompt[0].text.endsWith('hold')
    if (hold) {
      leaf = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        detached: true,
        stdio: 'ignore',
      })
      leaf.on('spawn', () => {
        writeFileSync('.native.json', JSON.stringify({ root: process.pid, leaf: leaf.pid }))
        update({
          sessionUpdate: 'tool_call',
          toolCallId: 'native',
          kind: 'execute',
          locations: [{ path: process.cwd() }],
        })
        permission()
      })
    } else {
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'native',
        kind: 'execute',
        locations: [{ path: process.cwd() }],
      })
      permission()
    }
  } else if (message.id === 0) {
    assert.equal(message.error, undefined)
    const outcome = message.result.outcome
    if (outcome.outcome === 'rejected') {
      assert.equal(outcome.reason, 'Invalid Cursor todo metadata')
      writeFileSync('.todo-rejected', 'yes')
      return
    }
    assert.deepEqual(outcome, {
      outcome: 'accepted',
      todos: todoParams.todos.map(({ id, content, status }) => ({ id, content, status })),
    })
    writeFileSync('.todo-accepted', 'yes')
    update({
      sessionUpdate: 'tool_call',
      toolCallId: 'native',
      kind: 'execute',
      locations: [{ path: process.cwd() }],
    })
    permission()
  } else if (message.id === 901) {
    assert.equal(message.error.code, -32601)
    assert.equal(
      message.error.message,
      'Client execution and interactive authentication are not supported',
    )
    writeFileSync('.request-denied', String(message.error.code))
  } else if (message.id === 900) {
    if (scopeTask?.endsWith('-scope') && scopeTask !== 'progress-scope') {
      assert.equal(message.result.outcome.optionId, 'no')
      writeFileSync('.scope-denied', 'yes')
      return
    }
    assert.equal(message.result.outcome.optionId, 'once')
    if (hold) {
      update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Holding native child' },
      })
      return
    }
    const before = readFileSync('clamp.mjs', 'utf8')
    assert.match(before, /=> n/)
    writeFileSync('clamp.mjs', 'export const clamp = n => Math.max(0, n)\n')
    writeFileSync('new.mjs', 'export const label = "🦊漢é"\n')
    execFileSync(process.execPath, ['--test', 'clamp.test.mjs'])
    const text =
      'x'.repeat(20000) + '🦊漢é\nAuthentication required is a coding feature, not a login request.'
    const bytes = Buffer.from(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
        },
      }) + '\n',
    )
    const split = bytes.indexOf(Buffer.from('🦊')) + 1
    process.stdout.write(bytes.subarray(0, split), () => {
      process.stdout.write(bytes.subarray(split))
      send({ id: promptId, result: { stopReason: 'end_turn' } })
    })
  } else if (message.method === 'session/cancel') {
    writeFileSync('.cancel-received', 'yes')
    // Deliberately keep the native child alive: runner must clean it, including its separate PGID.
    send({ id: promptId, result: { stopReason: 'cancelled' } })
  } else {
    assert.fail('Unexpected RPC or automatic resend')
  }
})
