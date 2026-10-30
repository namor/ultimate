import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import deepwiki from './server.ts'

function http(t: TestContext, result: unknown, cancelOnCall?: AbortController) {
  const requests: { method?: string; rpc?: { method: string; params?: unknown } }[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit) => {
    assert.equal(String(input), 'https://mcp.deepwiki.com/mcp')
    assert.equal(init.redirect, 'error')
    assert.ok(init.signal)
    assert.equal(new Headers(init.headers).has('authorization'), false)
    const rpc = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ method: init.method, rpc })
    if (rpc?.method === 'tools/call') cancelOnCall?.abort()
    init.signal.throwIfAborted()
    if (init.method === 'DELETE' || rpc.method === 'notifications/initialized') {
      return new Response(null, { status: 202 })
    }
    assert.ok(['initialize', 'tools/call'].includes(rpc.method))
    return Response.json(
      {
        jsonrpc: '2.0',
        id: rpc.id,
        result:
          rpc.method === 'initialize'
            ? {
                protocolVersion: '2025-11-25',
                capabilities: { tools: {} },
                serverInfo: { name: 'fixture', version: '1' },
                instructions: 'UNTRUSTED_SERVER_INSTRUCTIONS',
              }
            : result,
      },
      { headers: { 'mcp-session-id': 'fixture-session' } },
    )
  })
  return requests
}

const tools = deepwiki().tools!
async function run(index: number, signal = new AbortController().signal) {
  return tools[index].execute(
    { repoName: 'microsoft/TypeScript' },
    {} as never,
    { abortSignal: signal } as never,
  )
}

await test('two fixed public tools call the real Pi MCP HTTP client and convert results', async (t) => {
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['mcp__deepwiki__read_wiki_structure', 'mcp__deepwiki__read_wiki_contents'],
  )
  for (const [index, result, expected] of [
    [
      0,
      { content: [{ type: 'resource', resource: { uri: 'wiki://topics', text: 'Topics' } }] },
      'Topics',
    ],
    [1, { structuredContent: { page: 'Contents' } }, '{\n  "page": "Contents"\n}'],
  ] as const) {
    const requests = http(t, result)
    assert.deepEqual(await run(index), { output: [{ type: 'text', text: expected }] })
    assert.deepEqual(
      requests.map((request) => request.rpc?.method ?? request.method),
      ['initialize', 'notifications/initialized', 'tools/call', 'DELETE'],
    )
    assert.deepEqual(requests[2].rpc?.params, {
      name: index === 0 ? 'read_wiki_structure' : 'read_wiki_contents',
      arguments: { repoName: 'microsoft/TypeScript' },
    })
    t.mock.restoreAll()
  }
})

await test('remote MCP tool errors stay errors without leaking remote diagnostics', async (t) => {
  const requests = http(t, {
    isError: true,
    content: [{ type: 'text', text: 'UNSAFE_ENDPOINT_DEBUG_TRACE' }],
  })
  assert.deepEqual(await run(1), {
    isError: true,
    output: [{ type: 'text', text: 'DeepWiki public repository read failed.' }],
  })
  assert.equal(requests.at(-1)?.method, 'DELETE')
})

await test('canceling a read preserves the independent bounded session cleanup', async (t) => {
  const controller = new AbortController()
  const requests = http(t, {}, controller)
  let cleanupCompleted = false
  const fetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit) => {
    const response = await fetch(input, init)
    if (init.method === 'DELETE') cleanupCompleted = true
    return response
  })
  assert.equal((await run(0, controller.signal)).isError, true)
  assert.equal(requests.at(-1)?.method, 'DELETE')
  assert.equal(cleanupCompleted, true)
})

await test('abort during pending initialize after a mismatched-id reply cleans up once', async (t) => {
  const rejections: unknown[] = []
  const onUnhandled = (reason: unknown) => {
    rejections.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))

  const controller = new AbortController()
  const requests: { method?: string; rpc?: string }[] = []
  let initializeSeen!: () => void
  const initialized = new Promise<void>((resolve) => {
    initializeSeen = resolve
  })
  let releaseDelete!: () => void
  const deleteHold = new Promise<void>((resolve) => {
    releaseDelete = resolve
  })

  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit) => {
    assert.equal(String(input), 'https://mcp.deepwiki.com/mcp')
    assert.equal(init.redirect, 'error')
    assert.ok(init.signal)
    assert.equal(new Headers(init.headers).has('authorization'), false)
    const rpc = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ method: init.method, rpc: rpc?.method })
    if (init.method === 'DELETE') {
      assert.equal(controller.signal.aborted, true)
      assert.equal(init.signal.aborted, false)
      await deleteHold
      return new Response(null, { status: 202 })
    }
    if (rpc?.method === 'initialize') {
      initializeSeen()
      setImmediate(() => controller.abort())
      return Response.json(
        {
          jsonrpc: '2.0',
          id: 'wrong-id',
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'fixture', version: '1' },
          },
        },
        { headers: { 'mcp-session-id': 'fixture-session' } },
      )
    }
    throw new Error(`unexpected ${init.method} ${rpc?.method}`)
  })

  const done = run(0, controller.signal)
  let finished = false
  const observed = done.then(
    (result) => {
      finished = true
      return result
    },
    (error: unknown) => {
      finished = true
      throw error
    },
  )
  await initialized
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(requests.filter((request) => request.method === 'DELETE').length, 1)
  assert.equal(finished, false)
  assert.equal(
    requests.some((request) => request.rpc === 'tools/call'),
    false,
  )
  releaseDelete()
  assert.deepEqual(await observed, {
    isError: true,
    output: [{ type: 'text', text: 'DeepWiki public repository read failed.' }],
  })
  assert.equal(finished, true)
  assert.deepEqual(
    requests.map((request) => request.rpc ?? request.method),
    ['initialize', 'DELETE'],
  )
  assert.equal(rejections.length, 0)
})
