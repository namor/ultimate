import { expect, it } from 'vitest'
import type { Message } from '@earendil-works/pi-ai'
import {
  NATIVE_REPLAY_DIAGNOSTIC,
  prepareFrames,
} from '@earendil-works/pi-claude-code/src/transcript.ts'

// Pi upstream: @earendil-works/pi-claude-code@0.1.0 src/transcript.ts — tool calls made on openai-codex carry
// `call_…|fc_…` ids, which Anthropic rejects (^[a-zA-Z0-9_-]+$), so a conversation that switched to Claude Code
// failed every turn with a 400. Drop with the matching pnpm patch when upstream normalises tool ids.
const codexId = `call_f288e9ad4aff415d9db1f85caddf8936|fc_0de07bd9${'a'.repeat(40)}`

it('sends a Codex tool id as a valid id matching on tool_use and tool_result', () => {
  const history = [
    { role: 'user', content: 'List files', timestamp: 0 },
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id: codexId, name: 'bash', arguments: { command: 'ls' } }],
      api: 'openai-codex-responses',
      provider: 'openai-codex',
      model: 'gpt-6.1-sol',
      usage: {},
      stopReason: 'toolUse',
      timestamp: 0,
    },
    {
      role: 'toolResult',
      toolCallId: codexId,
      toolName: 'bash',
      content: [{ type: 'text', text: 'a.ts' }],
      isError: false,
      timestamp: 0,
    },
  ] as unknown as Message[]

  const [, call, result] = prepareFrames(history)
  const id = (call.message.content[0] as { id: string }).id
  expect(id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
  expect(result.message.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: id })
})

function turn(id: string, extra: Record<string, unknown> = {}) {
  return [
    { role: 'user', content: 'go', timestamp: 0 },
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id, name: 'read', arguments: { path: 'a' } }],
      timestamp: 1,
      ...extra,
    },
    {
      role: 'toolResult',
      toolCallId: id,
      toolName: 'read',
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
      timestamp: 2,
    },
  ] as unknown as Message[]
}

function ids(id: string) {
  const frames = prepareFrames(turn(id)) as any[]
  return {
    use: frames[1].message.content.find((b: any) => b.type === 'tool_use').id as string,
    result: frames[2].message.content[0].tool_use_id as string,
  }
}

it('normalises tool_use IDs inside a replay carrier', () => {
  const projection = {
    text: '',
    toolCalls: [{ id: 'call_x|fc_y', name: 'read', input: { path: 'a' } }],
  }
  const carrier = {
    version: 1,
    projection,
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 't', signature: 'sig' },
        { type: 'tool_use', id: 'call_x|fc_y', name: 'mcp__pi__read', input: { path: 'a' } },
      ],
    },
  }
  const diagnostics = [{ type: NATIVE_REPLAY_DIAGNOSTIC, timestamp: 0, details: { carrier } }]
  const frames = prepareFrames(turn('call_x|fc_y', { diagnostics })) as any[]
  const [thinking, use] = frames[1].message.content
  expect(use.id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
  expect(use.id).toBe(frames[2].message.content[0].tool_use_id)
  expect(thinking).toEqual({ type: 'thinking', thinking: 't', signature: 'sig' })
  expect((carrier.message.content[1] as any).id).toBe('call_x|fc_y')
})

it('is deterministic and keeps distinct invalid IDs distinct', () => {
  expect(ids('call_x|fc_y').use).toBe(ids('call_x|fc_y').use)
  expect(ids('call_x|fc_y').use).not.toBe(ids('call_x/fc_y').use)
})

it('passes valid native IDs through unchanged', () => {
  expect(ids('toolu_01A-b_c')).toEqual({ use: 'toolu_01A-b_c', result: 'toolu_01A-b_c' })
})
