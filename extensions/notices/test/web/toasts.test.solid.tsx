import { settle } from '@ui-sdk/core/testing'
import { createAgent } from '@ui-sdk/solid/agent'
import { flush } from 'solid-js'
import { expect, it, vi } from 'vitest'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'

vi.mock('../../../../web/src/sdk/client.ts', async () => {
  const { createStore } = await import('../../../../web/src/sdk/store.ts')
  const { createRegistry } = await import('../../../../web/src/sdk/registry.ts')
  const { createUiState } = await import('../../../../web/src/sdk/ui-state.ts')
  return {
    store: createStore({ fetch: async () => Response.json({ ok: true }) }),
    registry: createRegistry(),
    uiState: createUiState(undefined),
  }
})

import { store } from '../../../../web/src/sdk/client.ts'
import { Toasts } from '../../toasts.solid.tsx'

const agent = createAgent()
const region = () => agent.snapshot().find((item) => item.component === 'toast')

it('shows the newest three notices, folds the rest, dismisses each by name and clears all', async () => {
  renderSolid(() => <Toasts />)
  for (const message of ['First', 'Second', 'Same', 'Same', 'Fifth'])
    store.notify({ level: 'info', message })
  flush()
  await settle()

  const ids = store.getState().notices.map((notice) => notice.id)
  const press = async (button: string) => {
    expect(
      await agent.act({ steps: [{ ref: region()!.ref, action: 'press', args: [button] }] }),
    ).toMatchObject({ ok: true })
    await settle()
    flush()
    await settle()
  }
  expect(region()?.buttons).toEqual([
    `Dismiss notice ${ids[4]}: Fifth`,
    `Dismiss notice ${ids[3]}: Same`,
    `Dismiss notice ${ids[2]}: Same`,
    '+2 more',
    'Clear all',
  ])
  await press(`Dismiss notice ${ids[2]}: Same`)
  expect(region()?.buttons).toEqual([
    `Dismiss notice ${ids[4]}: Fifth`,
    `Dismiss notice ${ids[3]}: Same`,
    `Dismiss notice ${ids[1]}: Second`,
    '+1 more',
    'Clear all',
  ])
  await press('+1 more')
  expect(region()?.buttons).toContain(`Dismiss notice ${ids[0]}: First`)
  expect(region()?.buttons).toContain('Show less')
  await press('Clear all')
  expect(region()?.buttons ?? []).toEqual([])
})
