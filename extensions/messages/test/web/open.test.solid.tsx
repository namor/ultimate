import { settle } from '@ui-sdk/core/testing'
import { createAgent } from '@ui-sdk/solid/agent'
import { flush } from 'solid-js'
import { expect, it, vi } from 'vitest'
import { ConversationScope, ROOT } from '@/sdk/solid'
import { shellKeys } from '../../../../web/src/sdk/actions.ts'
import { parseConversationId } from '../../../../lib/ids.ts'
import type { FakeSource, fakeSubscriptions } from '../../../../test/web/fake-source.ts'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'
import * as client from '../../../../web/src/sdk/client.ts'
import { OpenMessages } from '../../open.solid.tsx'
import { MessagesDoc } from '../../refs.ts'

const sources = vi.hoisted(() => [] as FakeSource[])
vi.mock('../../../../web/src/sdk/client.ts', async () => {
  const { createStore } = await import('../../../../web/src/sdk/store.ts')
  const { createRegistry } = await import('../../../../web/src/sdk/registry.ts')
  const { createUiState } = await import('../../../../web/src/sdk/ui-state.ts')
  const { FakeSource, fakeSubscriptions } = await import('../../../../test/web/fake-source.ts')
  const server = fakeSubscriptions(sources)
  const store = createStore({
    eventSource: (url) => {
      const source = new FakeSource(url)
      sources.push(source)
      return source
    },
    fetch: async (url, init) =>
      server.handle(url as string, init) ?? Response.json({ ok: true, refused: {} }),
  })
  return { store, server, uiState: createUiState(undefined), registry: createRegistry() }
})

it('lists a delivered request once and opens the sender from its row', async ({
  onTestFinished,
}) => {
  const { store, uiState, server } = client as typeof client & {
    server: ReturnType<typeof fakeSubscriptions>
  }
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  store.start()
  onTestFinished(() => {
    store.stop()
    vi.unstubAllGlobals()
  })
  sources.at(-1)!.open()
  const sender = parseConversationId(12)
  const agent = createAgent()
  const view = renderSolid(() => (
    <ConversationScope value={ROOT}>
      <OpenMessages />
    </ConversationScope>
  ))
  await settle()
  expect(view.querySelector('[data-open-messages]')).toBeNull()
  server.of(ROOT)!.send('doc', {
    kind: MessagesDoc.kind,
    value: {
      next: 2,
      messages: [
        {
          id: 1,
          from: sender,
          to: ROOT,
          text: 'Please weigh in',
          at: 0,
          reply: true,
          state: 'delivered',
        },
      ],
    },
  })
  flush()
  expect(view.querySelector('[data-open-messages]')?.textContent).toContain('1 to reply')
  const popover = agent
    .snapshot()
    .find((entry) => !entry.offPage && entry.label === 'Open messages for #1')!
  expect(
    (await agent.act({ steps: [{ ref: popover.ref, action: 'setOpen', args: [true] }] })).ok,
  ).toBe(true)
  const row = agent
    .snapshot()
    .find(
      (entry) => !entry.offPage && entry.label === 'Waiting for this agent’s reply · message #1',
    )!
  expect((await agent.act({ steps: [{ ref: row.ref, action: 'press' }] })).ok).toBe(true)
  expect(uiState.get(shellKeys.conversation)).toBe(sender)
})
