/** @jsxImportSource @solidjs/web */
import type { ConversationId } from '@earendil-works/pi-durable'
import { settle } from '@ui-sdk/core/testing'
import { createAgent } from '@ui-sdk/solid/agent'
import { createSignal, flush } from 'solid-js'
import { expect, it, vi } from 'vitest'
import { ROOT, provide } from '@/sdk/solid'
import { expectDistinctAgentNames } from '../../../../test/web/agent-names.ts'
import type { FakeSource, fakeSubscriptions } from '../../../../test/web/fake-source.ts'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'
import { shellKeys } from '../../../../web/src/sdk/actions.ts'
import * as client from '../../../../web/src/sdk/client.ts'
import { InboxItems } from '../../../inbox/ui.solid.tsx'
import type { InboxItem } from '../../../inbox/ui.solid.tsx'
import { MessagesDoc } from '../../../messages/refs.ts'
import type { Message } from '../../../messages/refs.ts'
import { StandingDoc } from '../../../subagents/refs.ts'
import extension from '../../web.solid.tsx'

const sources = vi.hoisted(() => [] as FakeSource[])
vi.mock('../../../../web/src/sdk/client.ts', async () => {
  const { FakeSource, fakeSubscriptions } = await import('../../../../test/web/fake-source.ts')
  const { createStore } = await import('../../../../web/src/sdk/store.ts')
  const { createRegistry } = await import('../../../../web/src/sdk/registry.ts')
  const { createUiState } = await import('../../../../web/src/sdk/ui-state.ts')
  const server = fakeSubscriptions(sources)
  const store = createStore({
    eventSource: (url) => {
      const source = new FakeSource(url)
      sources.push(source)
      return source
    },
    fetch: async (input, init) => server.handle(input as string, init) ?? Response.json({}),
  })
  return { store, registry: createRegistry(), uiState: createUiState(undefined), server }
})
const { store, registry, uiState, server } = client as typeof client & {
  server: ReturnType<typeof fakeSubscriptions>
}
const agent = createAgent()

it('opens Inbox from above the primary composer and leaves the draft in place as waits clear', async ({
  onTestFinished,
}) => {
  const approval: InboxItem = {
    key: 'demo:approval',
    at: 2,
    tag: 'delivery',
    title: 'Approval',
    pane: null,
  }
  const [items, setItems] = createSignal<InboxItem[]>([])
  await registry.setLoaders({
    'extensions/inbox/web.solid.tsx': async () => ({ default: {} }),
    'extensions/demo/web.solid.tsx': async () => ({
      default: { provides: [provide(InboxItems, () => items)] },
    }),
  })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  store.start()
  onTestFinished(() => {
    store.stop()
    vi.unstubAllGlobals()
  })
  sources[0].open()
  const [dock, setDock] = createSignal(false)
  const Composer = extension.composer!
  const page = renderSolid(() => <Composer core={<textarea aria-label="Draft" />} dock={dock()} />)
  const button = () => page.querySelector('button')
  const input = page.querySelector('textarea')!
  input.value = 'Unsent draft'
  await settle()
  const primary = 2 as ConversationId
  const other = 3 as ConversationId
  server.of()!.send('view', { conversation: { id: primary }, entries: [], docs: {} })
  const standing = (ultimate: ConversationId) =>
    server.of(ROOT)!.send('doc', { kind: StandingDoc.kind, value: { ultimate } })
  standing(primary)
  flush()
  await settle()
  expect(button()).toBeNull()

  const ask: Message = {
    id: 1,
    from: other,
    to: 'user',
    reply: true,
    state: 'delivered',
    at: 1,
    text: 'Choose a time',
  }
  const report: Message = { ...ask, id: 2, to: primary, report: true }
  const messages = (question: Message) =>
    server
      .of(ROOT)!
      .send('doc', { kind: MessagesDoc.kind, value: { next: 3, messages: [question, report] } })
  messages(ask)
  setItems([approval])
  flush()
  expect(button()?.textContent).toBe('2 items need your input')
  expect(button()?.compareDocumentPosition(input)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  await expectDistinctAgentNames(agent)
  const control = agent
    .snapshot()
    .find((entry) => !entry.offPage && entry.label === '2 items need your input: open Inbox')!
  expect(await agent.act({ steps: [{ ref: control.ref, action: 'press' }] })).toMatchObject({
    ok: true,
  })
  expect(uiState.get(shellKeys.surface)).toBe('inbox')

  store.setUi({ surface: { id: 'inbox', title: 'Inbox' } })
  flush()
  expect(button()).toBeNull()
  setDock(true)
  store.setUi({ surface: { id: 'agent', title: 'Agent' } })
  flush()
  expect(button()).toBeNull()
  setDock(false)
  standing(other)
  flush()
  expect(button()).toBeNull()

  standing(primary)
  flush()
  await settle()
  messages({ ...ask, state: 'answered' })
  flush()
  expect(button()?.textContent).toBe('1 item needs your input')
  setItems([])
  flush()
  expect(button()).toBeNull()
  expect(page.querySelector('textarea')).toBe(input)
  expect(input.value).toBe('Unsent draft')
})
