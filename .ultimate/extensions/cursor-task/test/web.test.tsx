import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { ToolCallView } from '@/sdk'

vi.mock('@/sdk', () => ({
  actionRef: (extension: string, name: string) => ({ extension, name }),
  api: {},
  defineWebExtension: (definition: unknown) => definition,
  shortenPath: (path: string) => path,
  useSystem: () => undefined,
  useToolDuration: () => '1ms',
}))

vi.mock('@/sdk/hooks.ts', () => ({}))

import definition from '../web.tsx'

it('shows the real startup failure when the tool has diagnostics but no streamed output', () => {
  const call: ToolCallView = {
    id: 'blank-task',
    name: 'cursor_task',
    args: { task: ' ' },
    status: 'error',
    output: '',
    images: [],
    diagnostics: [{ severity: 'error', message: 'Task must not be blank' }],
  }
  const render = definition.tools?.cursor_task
  if (!render) throw new Error('Cursor task renderer unavailable')
  const html = renderToStaticMarkup(createElement(render, { call, core: null }))
  expect(html).toContain('Task must not be blank')
  expect(html).toContain('Failed')
  expect(html).not.toContain('Starting an independent Cursor agent')
})
