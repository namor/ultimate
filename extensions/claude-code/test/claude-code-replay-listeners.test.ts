import { Writable } from 'node:stream'
import { expect, it } from 'vitest'
import { writeFrame } from '@earendil-works/pi-claude-code/src/claude-cli.ts'

// The warm Claude Code process keeps its stdin across turns. Each backpressured history-replay frame used to leave an
// 'error' listener on it, until Node warned "11 error listeners added to [Writable]" (#64835).
it('leaves no listeners on the warm process stdin after backpressured replay frames', async () => {
  const stdin = new Writable({
    highWaterMark: 16,
    write: (_chunk, _encoding, done) => queueMicrotask(done),
  })
  const child = { stdin } as unknown as Parameters<typeof writeFrame>[0]
  const before = stdin.listenerCount('error')
  for (let frame = 0; frame < 12; frame++)
    await writeFrame(child, {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'x'.repeat(64) }] },
    })
  expect(stdin.listenerCount('error')).toBe(before)
  expect(stdin.listenerCount('drain')).toBe(0)
})
