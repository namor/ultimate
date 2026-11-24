/** @jsxImportSource @solidjs/web */
import { settle } from '@ui-sdk/core/testing'
import { createAgent } from '@ui-sdk/solid/agent'
import { createSignal, flush } from 'solid-js'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import type { ToolCallView } from '@/sdk/solid'
import { expectDistinctAgentNames } from '../../../../test/web/agent-names.ts'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'
import type { CursorJob } from '../types.d.ts'
import definition from '../web.solid.tsx'

const { action } = vi.hoisted(() => ({
  action:
    vi.fn<(ref: { extension: string; name: string }, args: { id: string }) => Promise<CursorJob>>(),
}))
vi.mock('@/sdk/solid', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sdk/solid')>()),
  api: { action },
}))

const agent = createAgent()
const diagnostic = { severity: 'error', message: 'Tool may have partially run' } as const
const job: CursorJob = {
  id: 'retained',
  task: 'Inspect changes',
  status: 'running',
  source: '/my-app',
  worktree: '/my-app-task',
  base: '0'.repeat(40),
  model: 'mock-model',
  startedAt: 1,
  activity: 'Native activity',
  nativeCalls: 1,
  resultPath: '/tmp/task/result.md',
  patchPath: '/tmp/task/changes.patch',
  summary: 'Saved **output**',
  diffStat: '1 file changed',
}

function mount(overrides: Partial<ToolCallView>) {
  const CursorTask = definition.tools?.cursor_task
  if (!CursorTask) throw new Error('Cursor task renderer unavailable')
  const [call, setCall] = createSignal<ToolCallView>({
    id: 'test-call',
    name: 'cursor_task',
    args: { task: job.task },
    status: 'error',
    output: '',
    images: [],
    diagnostics: [],
    ...overrides,
  })
  const card = renderSolid(() => <CursorTask call={call()} core={null} />)
  const button = (label: string) =>
    [...card.querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label,
    )
  return { card, button, setCall }
}

afterEach(() => {
  action.mockReset()
})

it('shows a startup diagnostic without a streamed job', () => {
  const { card, button } = mount({
    diagnostics: [{ severity: 'error', message: 'Task must not be blank' }],
  })
  expect(card.textContent).toContain('Task must not be blank')
  expect(card.textContent).toContain('Failed')
  expect(card.textContent).not.toContain('Starting an independent Cursor agent')
  expect(button('Cancel')).toBeUndefined()
})

it('refreshes an interrupted card and keeps the matching terminal report across stale updates', async () => {
  const { card, button, setCall } = mount({ details: job, diagnostics: [diagnostic] })
  expect(card.textContent).toContain('Interrupted')
  expect(button('Cancel')).toBeUndefined()
  expect(card.querySelector('strong')?.textContent).toBe('output')
  expect(card.querySelector('pre')?.textContent?.trim()).toBe('1 file changed')

  action.mockRejectedValueOnce(new Error('mock offline'))
  button('Refresh result')?.click()
  await settle()
  expect(card.querySelector('[role=alert]')?.textContent).toContain('Could not refresh')

  action.mockResolvedValueOnce({ ...job, status: 'complete', endedAt: 2, summary: 'Final report' })
  button('Refresh result')?.click()
  await settle()
  expect(action).toHaveBeenLastCalledWith({ extension: 'cursor-task', name: 'get' }, { id: job.id })
  expect(button('Refresh result')).toBeUndefined()
  expect(card.textContent).toContain('Complete')
  expect(card.textContent).toContain('Final report')
  expect(card.textContent).toContain('Full output is saved')
  expect(card.textContent).toContain(diagnostic.message)
  expect(card.querySelector('[role=alert]')).toBeNull()

  setCall((call) => ({ ...call, status: 'interrupted', details: { ...job, summary: 'Stale' } }))
  flush()
  expect(card.textContent).toContain('Final report')
  expect(card.textContent).not.toContain('Stale')

  setCall((call) => ({
    ...call,
    details: { ...job, id: 'different', status: 'failed', endedAt: 3, error: 'Cleanup unverified' },
  }))
  flush()
  expect(card.textContent).toContain('Failed')
  expect(card.textContent).toContain('Cleanup unverified')
  expect(card.textContent).not.toContain('Final report')
})

it('cancels a running job once and shows its retained interruption', async () => {
  const { card, button } = mount({ details: job, status: 'running' })
  const response = Promise.withResolvers<CursorJob>()
  action.mockReturnValueOnce(response.promise)
  button('Cancel')?.click()
  flush()
  const stopping = button('Stopping…')
  expect(stopping?.disabled).toBe(true)
  stopping?.click()
  expect(action).toHaveBeenCalledExactlyOnceWith(
    { extension: 'cursor-task', name: 'cancel' },
    { id: job.id },
  )
  response.resolve({ ...job, status: 'interrupted', endedAt: 2, summary: '' })
  await settle()
  expect(button('Cancel')).toBeUndefined()
  expect(button('Refresh result')).toBeDefined()
  expect(card.textContent).toContain('Inspect any saved output')
})

it('copies the complete retained artifact path and gives clipboard feedback', async () => {
  const writeText = vi
    .fn<Clipboard['writeText']>()
    .mockRejectedValueOnce(new Error('mock clipboard denied'))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  onTestFinished(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
  })
  const { card, button } = mount({ details: job })
  await expectDistinctAgentNames(agent)
  button('Copy result path')?.click()
  await settle()
  expect(card.querySelector('[role=alert]')?.textContent).toContain('Could not copy path')

  const copy = agent
    .snapshot()
    .find((entry) => !entry.offPage && entry.label === 'Copy result path')
  if (!copy) throw new Error('Copy result path unavailable')
  expect((await agent.act({ steps: [{ ref: copy.ref, action: 'press' }] })).ok).toBe(true)
  expect(writeText).toHaveBeenCalledTimes(2)
  expect(writeText).toHaveBeenLastCalledWith(job.resultPath)
  expect(button('Result path copied')).toBeDefined()
  expect(card.querySelector('[role=alert]')).toBeNull()
  expect(action).not.toHaveBeenCalled()
})
