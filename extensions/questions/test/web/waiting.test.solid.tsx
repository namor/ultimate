import { settle } from '@ui-sdk/core/testing'
import { createAgent } from '@ui-sdk/solid/agent'
import { flush } from 'solid-js'
import { expect, it, onTestFinished, vi } from 'vitest'
import { events, ROOT, writerNow } from '@/sdk/solid'
import { expectDistinctAgentNames } from '../../../../test/web/agent-names.ts'
import type { FakeSource, fakeSubscriptions } from '../../../../test/web/fake-source.ts'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'
import { shellKeys } from '../../../../web/src/sdk/actions.ts'
import * as client from '../../../../web/src/sdk/client.ts'
import { MessagesDoc } from '../../../messages/refs.ts'
import { WorkspacesDoc } from '../../../workspaces/refs.ts'
import { WaitingPill } from '../../waiting.solid.tsx'

const sources = vi.hoisted(() => [] as FakeSource[])
vi.mock('../../../../web/src/sdk/client.ts', async () => {
  const { FakeSource, fakeSubscriptions } = await import('../../../../test/web/fake-source.ts')
  const { createStore } = await import('../../../../web/src/sdk/store.ts')
  const { createUiState } = await import('../../../../web/src/sdk/ui-state.ts')
  const server = fakeSubscriptions(sources)
  const store = createStore({
    eventSource: (url) => {
      const source = new FakeSource(url)
      sources.push(source)
      return source
    },
    fetch: async (input, init) =>
      server.handle(input as string, init) ?? Response.json({ entries: [] }),
  })
  return { store, uiState: createUiState(undefined), server }
})
const { store, uiState, server } = client as typeof client & {
  server: ReturnType<typeof fakeSubscriptions>
}
const agent = createAgent()

it('counts open messages and delivery approvals, then opens the oldest in its conversation', async () => {
  const opened = vi.fn<(target: unknown, writer: string) => void>()
  onTestFinished(events.on('messages:open', (target) => opened(target, writerNow())))
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  store.start()
  onTestFinished(() => {
    store.stop()
    vi.unstubAllGlobals()
  })
  sources[0].open()
  uiState.set(shellKeys.surface, 'inbox')
  const view = renderSolid(() => <WaitingPill />)
  const waiting = () =>
    view.querySelector('button[data-waiting-pill]')?.getAttribute('data-waiting-pill')
  expect(waiting()).toBeUndefined()
  await settle()
  const root = server.of(ROOT)!
  const message = { id: 5, from: 2, to: 'user', reply: true, at: 30, state: 'delivered' }
  const sendMessage = (state: string) =>
    root.send('doc', {
      kind: MessagesDoc.kind,
      value: { next: 6, messages: [{ ...message, state }] },
    })
  const sendDelivery = (publishApproved: boolean) =>
    root.send('doc', {
      kind: WorkspacesDoc.kind,
      value: {
        queue: [
          {
            conversationId: 9,
            at: 120,
            steps: [{ at: 20 }],
            delivery: { stage: 'publish', risk: 'high', publishApproved },
          },
        ],
      },
    })
  sendMessage('delivered')
  sendDelivery(false)
  flush()
  await settle()
  expect(waiting()).toBe('2')
  await expectDistinctAgentNames(agent)
  const control = agent
    .snapshot()
    .find((entry) => !entry.offPage && entry.label === '2 waiting on you: open the oldest')!
  expect(await agent.act({ steps: [{ ref: control.ref, action: 'press' }] })).toMatchObject({
    ok: true,
  })
  expect(opened).toHaveBeenLastCalledWith({ conversation: 9, entry: 120 }, 'agent')
  expect(uiState.get(shellKeys.surface)).toBe('agent')
  expect(uiState.get(shellKeys.conversation)).toBe(9)

  sendDelivery(true)
  flush()
  expect(waiting()).toBe('1')
  view.querySelector<HTMLButtonElement>('button[data-waiting-pill]')!.click()
  expect(opened).toHaveBeenLastCalledWith({ conversation: 2, message: 5 }, 'person')
  expect(uiState.get(shellKeys.conversation)).toBe(2)
  sendMessage('answered')
  flush()
  expect(waiting()).toBeUndefined()
})
