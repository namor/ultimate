import assert from 'node:assert/strict'
import dns from 'node:dns/promises'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import publicDocs from './server.ts'

const exa = 'https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa'
const context7 = 'https://mcp.context7.com/mcp'
const tools = publicDocs().tools!
const failed = {
  isError: true,
  output: [{ type: 'text', text: 'Public documentation read failed.' }],
}

function http(t: TestContext, endpoint: string, result: unknown, cancelOnCall?: AbortController) {
  const requests: { method?: string; rpc?: { method: string; params?: unknown } }[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit) => {
    assert.equal(String(input), endpoint)
    assert.equal(init.redirect, 'error')
    assert.ok(init.signal)
    for (const key of new Headers(init.headers).keys()) {
      assert.ok(['accept', 'content-type', 'mcp-session-id', 'mcp-protocol-version'].includes(key))
    }
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

function lookup(t: TestContext, addresses: string[] | Error = ['93.184.215.14']) {
  return t.mock.method(dns, 'lookup', async () => {
    if (addresses instanceof Error) throw addresses
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  })
}

async function run(index: number, args: Record<string, unknown>, signal?: AbortSignal) {
  return tools[index].execute(args as never, {} as never, { abortSignal: signal } as never)
}

await test('four native tools use real Pi HTTP with exact endpoints/payloads and bounded text conversion', async (t) => {
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'mcp__exa__web_search_exa',
      'mcp__exa__web_fetch_exa',
      'mcp__context7__resolve_library_id',
      'mcp__context7__query_docs',
    ],
  )
  const cases = [
    {
      index: 0,
      endpoint: exa,
      name: 'web_search_exa',
      args: { query: 'TypeScript documentation', objective: 'Find the public handbook' },
      sent: {
        query: 'TypeScript documentation',
        objective: 'Find the public handbook',
        numResults: 5,
      },
      result: { content: [{ type: 'text', text: 'x'.repeat(25_000) }] },
      expected: 'x'.repeat(24_000 - 20) + '\n[Output truncated]',
    },
    {
      index: 1,
      endpoint: exa,
      name: 'web_fetch_exa',
      args: { urls: ['https://www.typescriptlang.org/docs/'] },
      sent: { urls: ['https://www.typescriptlang.org/docs/'], maxCharacters: 3000 },
      result: {
        content: [{ type: 'resource', resource: { uri: 'docs://page', text: 'Handbook' } }],
      },
      expected: 'Handbook',
    },
    {
      index: 2,
      endpoint: context7,
      name: 'resolve-library-id',
      args: { query: 'Public TypeScript handbook', libraryName: 'TypeScript' },
      sent: { query: 'Public TypeScript handbook', libraryName: 'TypeScript' },
      result: { structuredContent: { libraryId: '/microsoft/typescript' } },
      expected: '{\n  "libraryId": "/microsoft/typescript"\n}',
    },
    {
      index: 3,
      endpoint: context7,
      name: 'query-docs',
      args: {
        libraryId: '/microsoft/typescript',
        query: 'Explain public compiler options',
        language: 'en',
      },
      sent: {
        libraryId: '/microsoft/typescript',
        query: 'Explain public compiler options',
        language: 'en',
      },
      result: { content: [{ type: 'text', text: 'Compiler options' }] },
      expected: 'Compiler options',
    },
  ]
  for (const item of cases) {
    lookup(t)
    const requests = http(t, item.endpoint, item.result)
    assert.deepEqual(await run(item.index, item.args), {
      output: [{ type: 'text', text: item.expected }],
    })
    assert.ok(item.expected.length <= 24_000)
    assert.deepEqual(
      requests.map((request) => request.rpc?.method ?? request.method),
      ['initialize', 'notifications/initialized', 'tools/call', 'DELETE'],
    )
    assert.deepEqual(requests[2].rpc?.params, { name: item.name, arguments: item.sent })
    t.mock.restoreAll()
  }
})

await test('remote tool errors stay errors without leaking diagnostics', async (t) => {
  const requests = http(t, context7, {
    isError: true,
    content: [{ type: 'text', text: 'UNSAFE_ENDPOINT_DEBUG_TRACE' }],
  })
  assert.deepEqual(await run(2, { query: 'Public docs', libraryName: 'TypeScript' }), failed)
  assert.equal(requests.at(-1)?.method, 'DELETE')
})

await test('cancellation preserves independent bounded Pi session cleanup', async (t) => {
  const controller = new AbortController()
  const requests = http(t, exa, {}, controller)
  let cleanupCompleted = false
  const fetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit) => {
    const response = await fetch(input, init)
    if (init.method === 'DELETE') {
      assert.equal(controller.signal.aborted, true)
      assert.equal(init.signal?.aborted, false)
      cleanupCompleted = true
    }
    return response
  })
  assert.deepEqual(
    await run(0, { query: 'TypeScript', objective: 'Public docs' }, controller.signal),
    failed,
  )
  assert.equal(requests.at(-1)?.method, 'DELETE')
  assert.equal(cleanupCompleted, true)
})

await test('public URL guard rejects unsafe URLs and every nonpublic DNS answer before any Exa request', async (t) => {
  const cases: { url: string; addresses?: string[] | Error; allowed?: boolean; noDns?: boolean }[] =
    [
      ...[
        'http://localhost',
        'http://printer',
        'http://docs.local',
        'http://docs.internal',
        'http://docs.localhost',
        'http://docs.lan',
        'http://docs.home',
        'http://docs.test',
        'http://docs.invalid',
        'http://docs.onion',
        'http://docs.arpa',
        'http://127.0.0.1',
        'http://0x7f000001',
        'http://0177.0.0.1',
        'http://2130706433',
        'http://[::1]',
        'http://[::ffff:127.0.0.1]',
        'https://8.8.8.8',
        'https://user:pass@docs.example.org',
        'https://@docs.example.org',
        'https://docs.example.org/#section',
        'https://docs.example.org/#',
        'https://docs.example.org:8443/',
        'file:///etc/passwd',
      ].map((url) => ({ url, noDns: true })),
      ...[
        '0.1.2.3',
        '10.1.2.3',
        '100.64.0.1',
        '127.0.0.1',
        '169.254.1.1',
        '172.16.0.1',
        '192.0.0.1',
        '192.0.2.1',
        '192.88.99.1',
        '192.168.0.1',
        '198.18.0.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1',
        '255.255.255.255',
        '::',
        '::1',
        'fc00::1',
        'fe80::1',
        'ff02::1',
        '::ffff:10.0.0.1',
        '64:ff9b::a00:1',
        '2001::1',
        '2001:db8::1',
        '2002:a00:1::',
        '3ffe::1',
        '3fff::1',
      ].map((address) => ({ url: 'https://docs.example.org', addresses: [address] })),
      { url: 'https://docs.example.org', addresses: ['93.184.215.14', '10.0.0.1'] },
      { url: 'https://docs.example.org', addresses: [] },
      { url: 'https://docs.example.org', addresses: new Error('PRIVATE_DNS_DIAGNOSTIC') },
      {
        url: 'https://docs.example.org',
        addresses: ['93.184.215.14', '2606:4700:4700::1111'],
        allowed: true,
      },
      { url: 'http://www.typescriptlang.org:80/docs/', allowed: true },
    ]
  for (const item of cases) {
    const dnsMock = lookup(t, item.addresses)
    const requests = http(t, exa, { content: [{ type: 'text', text: 'Public page' }] })
    const result = await run(1, { urls: [item.url] })
    assert.deepEqual(
      result,
      item.allowed ? { output: [{ type: 'text', text: 'Public page' }] } : failed,
      item.url,
    )
    assert.equal(requests.length, item.allowed ? 4 : 0, item.url)
    if (item.noDns) assert.equal(dnsMock.mock.callCount(), 0, item.url)
    t.mock.restoreAll()
  }
})
