/** @jsxImportSource @solidjs/web */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { Message } from '../../../messages/refs.ts'
import type { InboxItem } from '../../../inbox/ui.tsx'
import extension from '../../web.tsx'

const fixture = vi.hoisted(() => ({
  id: 2,
  messages: [] as Message[],
  items: [] as InboxItem[],
  showSurface: vi.fn<(id: string) => void>(),
}))

vi.mock('@/sdk', () => ({
  ROOT: 1,
  cn: (...values: string[]) => values.join(' '),
  column: () => '',
  definePoint: (id: string) => id,
  defineWebExtension: (value: unknown) => value,
  useConversation: (select: (conversation: { id: number }) => unknown) => select(fixture),
  useDocOf: (_id: number, doc: string) =>
    doc === 'standing' ? { ultimate: 2 } : { messages: fixture.messages },
  useExtensions: () => [{ name: 'inbox', extension: {} }],
  useUltimate: () => ({ surface: 'agent', showSurface: fixture.showSurface }),
  AllProvided: ({ children }: { children: (items: InboxItem[][]) => unknown }) =>
    children([fixture.items]),
}))
vi.mock('../../../messages/ui.tsx', () => ({
  MessagesDoc: 'board',
  emptyMessages: { messages: [] },
}))
vi.mock('../../../subagents/ui.tsx', () => ({ StandingDoc: 'standing' }))

it('opens Inbox from the primary composer and removes the bar as genuine items clear', async ({
  onTestFinished,
}) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const page = document.createElement('div')
  const root = createRoot(page)
  onTestFinished(async () => {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  })
  const Composer = extension.composer!
  const core = createElement('textarea')
  const render = (dock = false) =>
    act(async () => root.render(createElement(Composer, { core, dock })))
  const bar = () => page.querySelector('button')
  const ask = { id: 1, from: 3, to: 'user', reply: true, state: 'delivered', at: 1 } as Message
  const report = { ...ask, id: 2, to: 2, report: true } as Message
  fixture.messages = [ask, report]
  fixture.items = [{ key: 'demo:approval', at: 2, tag: 'delivery', title: 'Approval', pane: null }]

  await render()
  expect(bar()?.textContent?.trim()).toBe('2 items need your input')
  await act(async () => bar()?.click())
  expect(fixture.showSurface).toHaveBeenCalledExactlyOnceWith('inbox')
  const input = page.querySelector('textarea')
  expect(input).not.toBeNull()

  await render(true)
  expect(bar()).toBeNull()
  fixture.id = 3
  await render()
  expect(bar()).toBeNull()
  fixture.id = 2
  fixture.messages = [{ ...ask, state: 'answered' }, report]
  await render()
  expect(bar()?.textContent?.trim()).toBe('1 item needs your input')
  fixture.items = []
  await render()
  expect(bar()).toBeNull()
  expect(page.querySelector('textarea')).toBe(input)
})
