import { stream } from '@earendil-works/pi-ai/api/openai-codex-responses'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript'
import { validateToolArguments } from '@earendil-works/pi-ai/utils/validation'
import { CodemodeSandbox } from '@earendil-works/pi-codemode'
import { createCodemodeTool } from '@earendil-works/pi-durable/codemode'
import type { Message } from '@earendil-works/pi-ai'
import { expect, it } from 'vitest'

it('replays Codemode calls in the format declared at each turn without relaxing validation', async () => {
  const model = openaiCodexProvider()
    .getModels()
    .find((item) => item.id === 'gpt-6.2-sol')!
  const tool = createCodemodeTool({ sandbox: new CodemodeSandbox(), models: false })
  const { name, description, parameters } = tool
  const oldTool = { name, description, parameters }
  const code = 'const n = 1; return n'
  const token = `fixture.${btoa(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } }))}.fixture`
  const pair = (id: string): Message[] => [
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id, name, arguments: { code } }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      timestamp: 2,
      stopReason: 'toolUse',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    },
    {
      role: 'toolResult',
      toolCallId: id,
      toolName: name,
      content: [{ type: 'text', text: '1' }],
      isError: false,
      timestamp: 3,
    },
  ]

  async function call(type: 'function_call' | 'custom_tool_call', value: string) {
    const json = type === 'function_call'
    const field = json ? 'arguments' : 'input'
    const eventKind = json ? 'function_call_arguments' : 'custom_tool_call_input'
    const item = { type, name, call_id: 'call_test', id: json ? 'fc_test' : 'ctc_test' }
    const events = [
      { type: 'response.output_item.added', output_index: 0, item: { ...item, [field]: '' } },
      { type: `response.${eventKind}.delta`, output_index: 0, delta: value.slice(0, 7) },
      { type: `response.${eventKind}.delta`, output_index: 0, delta: value.slice(7) },
      { type: `response.${eventKind}.done`, output_index: 0, [field]: value },
      { type: 'response.output_item.done', output_index: 0, item: { ...item, [field]: value } },
      { type: 'response.completed', response: { status: 'completed', output: [] } },
    ]
    let payloadItems: unknown[] | undefined
    const result = await stream(
      model,
      normalizeContext({
        messages: [
          { role: 'system', content: '', toolsAdded: [oldTool], timestamp: 1 },
          { role: 'user', content: 'Run a script', timestamp: 2 },
          ...pair('call_legacy|fc_legacy'),
          {
            role: 'system',
            content: '',
            toolsRemoved: [{ name }],
            toolsAdded: [tool],
            timestamp: 4,
          },
          { role: 'user', content: 'Run another script', timestamp: 5 },
          ...pair('call_grammar|ctc_grammar'),
          { role: 'user', content: 'Continue', timestamp: 8 },
        ],
      }),
      {
        apiKey: token,
        transport: 'sse',
        maxRetries: 0,
        onPayload(payload) {
          const input = (payload as { input: { type?: string }[] }).input
          payloadItems = input.filter(
            (entry) => entry.type === 'additional_tools' || entry.type?.includes('_call'),
          )
        },
        fetch: async () =>
          new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')),
      },
    ).result()
    expect(result).toMatchObject({ stopReason: 'toolUse', content: [{ type: 'toolCall', name }] })
    expect(payloadItems).toEqual([
      expect.objectContaining({
        type: 'additional_tools',
        tools: [expect.objectContaining({ name, type: 'function' })],
      }),
      expect.objectContaining({
        type: 'function_call',
        name,
        id: 'fc_legacy',
        call_id: 'call_legacy',
        arguments: JSON.stringify({ code }),
      }),
      expect.objectContaining({ type: 'function_call_output', call_id: 'call_legacy' }),
      expect.objectContaining({
        type: 'additional_tools',
        tools: [expect.objectContaining({ name, type: 'custom' })],
      }),
      expect.objectContaining({
        type: 'custom_tool_call',
        name,
        call_id: 'call_grammar',
        input: code,
      }),
      expect.objectContaining({ type: 'custom_tool_call_output', call_id: 'call_grammar' }),
    ])
    const [block] = result.content
    if (block?.type !== 'toolCall') throw new Error('Missing tool call')
    return block
  }

  const malformed = await call('function_call', code)
  expect(malformed).toMatchObject({
    arguments: {},
    argumentsError: expect.stringContaining('is not valid JSON'),
  })
  expect(() => validateToolArguments(tool, malformed)).toThrow(
    'Invalid arguments for tool "codemode": Unexpected token',
  )
  expect(
    validateToolArguments(tool, await call('function_call', JSON.stringify({ code }))),
  ).toEqual({ code })
  expect(validateToolArguments(tool, await call('custom_tool_call', code))).toEqual({ code })
})
