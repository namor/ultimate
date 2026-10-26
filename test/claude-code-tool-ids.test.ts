import { expect, it } from 'vitest'
import {
  NATIVE_REPLAY_DIAGNOSTIC,
  prepareFrames,
} from '@earendil-works/pi-claude-code/src/transcript.ts'

// Pi upstream: @earendil-works/pi-claude-code@0.1.0 src/transcript.ts — Anthropic rejects tool IDs outside [a-zA-Z0-9_-]+, so foreign IDs (Codex `call_x|fc_y`) must be normalised in outbound frames. Drop with the matching pnpm patch when upstream fixes this.
const valid = /^[a-zA-Z0-9_-]+$/

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
  ] as never
}

function ids(id: string, extra?: Record<string, unknown>) {
  const frames = prepareFrames(turn(id, extra)) as any[]
  return {
    use: frames[1].message.content.find((b: any) => b.type === 'tool_use').id as string,
    result: frames[2].message.content[0].tool_use_id as string,
  }
}

it('gives a foreign tool call and its result the same valid ID', () => {
  const { use, result } = ids('call_x|fc_y')
  expect(use).toBe(result)
  expect(use).toMatch(valid)
  expect(use.length).toBeLessThanOrEqual(64)
})

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
  expect(use.id).toMatch(valid)
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
