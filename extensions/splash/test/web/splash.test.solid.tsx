import { dynamic } from '@solidjs/web'
import { createSignal, flush } from 'solid-js'
import { afterEach, expect, it, vi } from 'vitest'
import { renderSolid } from '../../../../test/web/solid-dom-setup.ts'
import facet from '../../web.solid.tsx'

const readiness = vi.hoisted(() => ({
  ready: (): boolean => false,
  timedOut: false,
  failed: [] as string[],
  pending: (): string[] => [],
  notify: vi.fn<(notice: { level: string; message: string }) => void>(),
}))
vi.mock('@/sdk/solid', () => ({
  api: { action: async () => ({ firstRun: false }) },
  defineWebExtension: (extension: unknown) => extension,
  errorMessage: String,
  notify: readiness.notify,
  useReady: () => () => ({
    ready: readiness.ready(),
    timedOut: readiness.timedOut,
    failed: readiness.failed,
    pending: readiness.pending(),
  }),
}))
vi.mock('@/sdk/resume.ts', () => ({ resumed: false }))

afterEach(() => {
  readiness.ready = () => false
  readiness.timedOut = false
  readiness.failed = []
  readiness.pending = () => []
  readiness.notify.mockClear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('blocks app input while starting and restores the focus requested underneath the splash', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  const [ready, setReady] = createSignal(false)
  readiness.ready = ready
  const slot = facet.slots?.overlay
  if (typeof slot !== 'function') throw new Error('Missing splash overlay')
  const Splash = dynamic(() => slot)
  const view = renderSolid(() => (
    <>
      <textarea aria-label="Composer" />
      <Splash />
    </>
  ))
  const composer = view.querySelector('textarea')!
  const splash = view.querySelector('[data-splash]')!
  composer.focus()
  expect(document.activeElement).toBe(splash)
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  expect(splash.dispatchEvent(escape)).toBe(false)

  setReady(true)
  flush()
  expect(view.querySelector('progress')?.getAttribute('aria-label')).toBe('Loading Ultimate')
  await vi.advanceTimersByTimeAsync(400)
  flush()
  expect(view.querySelector('progress')).toBeNull()
  expect(document.activeElement).toBe(composer)
  expect(readiness.notify).not.toHaveBeenCalled()
})

it('reports slow extensions once through the notices stack', () => {
  readiness.ready = () => true
  const [pending, setPending] = createSignal(['search'])
  readiness.timedOut = true
  readiness.failed = ['notes']
  readiness.pending = pending
  const slot = facet.slots?.overlay
  if (typeof slot !== 'function') throw new Error('Missing splash overlay')
  const Splash = dynamic(() => slot)
  const view = renderSolid(() => <Splash />)
  expect(view.querySelector('[data-splash]')).toBeNull()
  expect(readiness.notify).toHaveBeenCalledExactlyOnceWith({
    level: 'warning',
    message: expect.stringContaining('still loading: search; failed: notes'),
  })
  setPending([])
  flush()
  expect(readiness.notify).toHaveBeenCalledTimes(1)
})
