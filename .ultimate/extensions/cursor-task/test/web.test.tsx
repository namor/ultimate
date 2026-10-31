import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { ToolCallView } from '@/sdk'
import type { CursorJob } from '../types.d.ts'

vi.mock('@/sdk', () => ({
  actionRef: (extension: string, name: string) => ({ extension, name }),
  api: {},
  defineWebExtension: (definition: unknown) => definition,
  shortenPath: (path: string) => path,
  useSystem: () => undefined,
  useToolDuration: () => '1ms',
}))

vi.mock('@/sdk/hooks.ts', () => ({ useExtensions: () => [] }))

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

it('recovers a stale active job after tool interruption and respects the saved terminal outcome', () => {
  const job: CursorJob = {
    id: 'recovery',
    task: 'Inspect changes',
    status: 'running',
    source: '/my-app',
    worktree: '/my-app-task',
    base: '0'.repeat(40),
    model: 'grok-4.6[effort=xhigh,fast=false]',
    startedAt: 1,
    activity: 'Native activity',
    nativeCalls: 1,
    resultPath: '/tmp/task/result.md',
    patchPath: '/tmp/task/changes.patch',
    summary: 'Saved output',
    diffStat: '',
  }
  const call: ToolCallView = {
    id: 'recovery-call',
    name: 'cursor_task',
    args: { task: job.task },
    status: 'error',
    output: '',
    images: [],
    diagnostics: [
      { severity: 'error', message: 'Tool was interrupted and may have partially run' },
    ],
    details: job,
  }
  const render = definition.tools?.cursor_task
  if (!render) throw new Error('Cursor task renderer unavailable')
  const interrupted = renderToStaticMarkup(createElement(render, { call, core: null }))
  expect(interrupted).toContain('>Interrupted</span>')
  expect(interrupted).toContain('Refresh result')
  expect(interrupted).not.toContain('Cancel')

  call.status = 'interrupted'
  call.details = { ...job, status: 'complete', endedAt: 2 }
  const complete = renderToStaticMarkup(createElement(render, { call, core: null }))
  expect(complete).toContain('>Complete</span>')
  expect(complete).toContain('Tool was interrupted and may have partially run')
  expect(complete).not.toContain('Refresh result')
  expect(complete).not.toContain('Cancel')

  call.details = { ...job, status: 'failed', endedAt: 2, error: 'Local cleanup unverified' }
  const failed = renderToStaticMarkup(createElement(render, { call, core: null }))
  expect(failed).toContain('>Failed</span>')
  expect(failed).toContain('Local cleanup unverified')
  expect(failed).not.toContain('>Complete</span>')
})
