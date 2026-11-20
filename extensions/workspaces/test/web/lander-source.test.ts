import { createElement } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ConversationId, EntryId } from '@earendil-works/pi-durable'
import { beforeEach, expect, it, vi } from 'vitest'
import type { WorkspaceIndex } from '../../types.ts'

const state = vi.hoisted(() => ({ id: 28, index: {} as WorkspaceIndex }))
vi.mock('@/sdk', async () => ({
  ...(await import('../../../../web/src/sdk/types.ts')),
  ROOT: 1,
  cn: (await import('cn')).cn,
  column: (await import('../../../../web/src/app/layout.ts')).column,
  defineWebExtension: (facet: unknown) => facet,
  useConversation: (select: (conversation: { id: number }) => unknown) => select({ id: state.id }),
  useSystem: () => ({ project: { root: '/projects/my-app' } }),
  useDocOf: () => state.index,
  useConversations: () => [],
  useTranscript: () => [],
}))
vi.mock('@/components/ai/message', () => ({}))
vi.mock('../../log.tsx', () => ({
  WorkspaceCall: () => null,
  LanderLogEntry: () => null,
  LanderReport: () => null,
}))
vi.mock('../../landing.tsx', () => ({}))

import facet from '../../web.tsx'
import { landerSource } from '../../data.tsx'

const composer = facet.composer as ComponentType<{ core: string }>
const render = () => renderToStaticMarkup(createElement(composer, { core: 'composer' }))

beforeEach(() => {
  state.id = 28
  state.index = {
    items: {},
    queue: [],
    landers: {},
    results: {},
    landerConversations: {
      '/projects/my-app': 28 as ConversationId,
      '/tmp/my-app-integration': 42 as ConversationId,
    },
  }
})

it('distinguishes project and additional checkout landers without losing their source paths', () => {
  expect(landerSource(state.index, 28, '/projects/my-app')).toEqual({
    label: 'Project checkout',
    path: '/projects/my-app',
  })
  expect(landerSource(state.index, 42, '/projects/my-app')).toEqual({
    label: 'my-app-integration',
    path: '/tmp/my-app-integration',
  })
  expect(render()).toContain('One landing log per source checkout')
  expect(render()).toContain('Project checkout')
  expect(render()).toContain('/projects/my-app')
  state.id = 42
  expect(render()).toContain('my-app-integration')
  expect(render()).toContain('/tmp/my-app-integration')
  state.id = 99
  expect(render()).toBe('composer')
})

it('replaces only the lander’s empty welcome with log context, not model setup', () => {
  const empty = () =>
    facet.provides![0].use({ conversation: state.id, core: 'core' } as never) as ReactNode
  const html = renderToStaticMarkup(createElement(() => empty()))
  expect(html).toContain('No landings yet')
  expect(html).toContain('checks and outcomes')
  expect(html).not.toMatch(/model|configure|prompt/)
  state.id = 99
  expect(empty()).toBe('core')
})

it('shows activity only for the log’s own source checkout', () => {
  state.index.queue = [
    {
      id: 'submission',
      conversationId: 9 as ConversationId,
      source: '/tmp/my-app-integration',
      target: 'main',
      tip: 'abc',
      at: 1 as EntryId,
      divergence: 'None',
      state: 'landing',
      steps: [],
    },
    {
      id: 'waiting',
      conversationId: 10 as ConversationId,
      source: '/tmp/my-app-integration',
      target: 'main',
      tip: 'def',
      at: 2 as EntryId,
      divergence: 'None',
      state: 'queued',
      steps: [],
    },
  ]
  expect(render()).toContain('Idle')
  expect(render()).not.toContain('1 queued')
  state.id = 42
  expect(render()).toContain('Landing')
  expect(render()).toContain('1 queued')
})
