import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { chromium } from 'playwright-core'
import { afterEach, expect, it, vi } from 'vitest'
import { fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux'
import type { ConversationDocToken, ConversationId } from '@earendil-works/pi-durable'
import { ProjectTrustStore } from '@earendil-works/pi-coding-agent'
import { context } from '../../server/harness.ts'
import { projectDecision, projectSettings } from '../../server/project-setup.ts'
import { git } from '../../lib/git.ts'
import { browserBinary } from '../../extensions/browser/server.ts'
import { fastForwardTarget } from '../../extensions/workspaces/lander.ts'
import { setAutomaticSummaries } from '../../extensions/conversations/summary.ts'
import type { WorkspaceIndex } from '../../extensions/workspaces/types.ts'
import { fauxServer, post, removeTemp, sourceCopy, temp, until } from '../helpers.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) await close()
  vi.unstubAllEnvs()
})

it('advances the target worktree without touching the source after its checked-out branch changes', async () => {
  const home = await temp('ultimate-delivery-target-')
  cleanup.push(() => removeTemp(home))
  const source = join(home, 'source')
  await git(home, 'init', '-b', 'main', source)
  await git(source, 'config', 'user.name', 'Fixture')
  await git(source, 'config', 'user.email', 'fixture@example.invalid')
  await git(source, 'commit', '--allow-empty', '-m', 'Baseline')
  const base = await git(source, 'rev-parse', 'HEAD')
  await git(source, 'switch', '-c', 'candidate')
  await writeFile(join(source, 'feature.txt'), 'Candidate\n')
  await git(source, 'add', 'feature.txt')
  await git(source, 'commit', '-m', 'Candidate')
  const candidate = await git(source, 'rev-parse', 'HEAD')
  await git(source, 'switch', '-c', 'unrelated', base)
  const target = join(home, 'main')
  await git(source, 'worktree', 'add', target, 'main')
  await fastForwardTarget(source, 'main', base, candidate)
  expect(await git(source, 'symbolic-ref', '--short', 'HEAD')).toBe('unrelated')
  expect(await git(source, 'rev-parse', 'HEAD')).toBe(base)
  expect(await git(target, 'rev-parse', 'HEAD')).toBe(candidate)
  expect(await git(source, 'rev-parse', 'main')).toBe(candidate)
})

it('keeps main unchanged and exposes a candidate-bound publication gate with declined trust', async () => {
  const home = await temp('ultimate-delivery-')
  cleanup.push(() => removeTemp(home))
  const project = join(home, 'project')
  await mkdir(project)
  await git(home, 'init', '-b', 'main', project)
  await git(project, 'config', 'user.name', 'Fixture')
  await git(project, 'config', 'user.email', 'fixture@example.invalid')
  await writeFile(join(project, 'README.md'), 'Fixture\n')
  await git(project, 'add', 'README.md')
  await git(project, 'commit', '-m', 'Start fixture')
  const baseline = await git(project, 'rev-parse', 'HEAD')
  const remote = join(home, 'remote.git')
  await git(home, 'clone', '--bare', project, remote)
  await git(project, 'remote', 'add', 'origin', remote)
  const bin = join(home, 'bin')
  await mkdir(bin)
  const gh = join(bin, 'gh')
  await writeFile(
    gh,
    `#!${process.execPath}\nif (!process.argv.at(-1).endsWith('/branches/main')) throw new Error('Unexpected fixture request');\nconsole.log('HTTP/2.0 200 OK\\r\\n\\r\\n' + JSON.stringify({commit:{sha:${JSON.stringify(baseline)}}}));\n`,
  )
  await chmod(gh, 0o755)
  vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH}`)
  await mkdir(join(home, '.ultimate'))
  await writeFile(
    join(home, '.ultimate/settings.json'),
    JSON.stringify({
      extensions: { disable: ['update'] },
      delivery: {
        [project]: {
          repository: 'example/my-app',
          remote: 'origin',
          base: 'main',
          checks: ['test -f feature.txt'],
          requiredChecks: ['verify'],
        },
      },
    }),
  )
  new ProjectTrustStore(join(home, '.ultimate')).set(project, false)
  const source = await sourceCopy(home)
  const probe = join(source, 'extensions/delivery-probe')
  await mkdir(probe)
  await writeFile(
    join(probe, 'server.ts'),
    `export const actions = { attempt: (args, { host, signal, conversationId }) => host.invoke('workspaces', 'delivery', args, signal, conversationId) }; export default { name: 'delivery-probe' }`,
  )
  const server = await fauxServer({
    ultimateRoot: source,
    projectRoot: project,
    userHome: home,
    localSetup: false,
    home: join(home, 'state'),
    port: 0,
  })
  cleanup.push(() => server.close())
  const doc = server.extensions.doc('ultimate.workspaces') as ConversationDocToken<WorkspaceIndex>
  const created = await post(server, '/api/extensions/workspaces/actions/create', {
    args: { cwd: project, title: 'Delivery fixture' },
  })
  const id = created.data.result.id as ConversationId
  await server.harness.commit((tx) => setAutomaticSummaries(tx, id, false), context)
  await until(
    async () =>
      (await post(server, '/api/extensions/workspaces/actions/info', { args: { id } })).data.result
        .state === 'ready',
  )
  const info = await post(server, '/api/extensions/workspaces/actions/info', { args: { id } })
  const path = info.data.result.path as string
  await writeFile(join(path, 'feature.txt'), 'Verified fixture\n')
  await git(path, 'add', 'feature.txt')
  await git(path, 'commit', '-m', 'Add fixture feature')
  server.host.faux!.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall('workspace', {
          action: 'submit',
          divergence: 'None',
          risk: 'high',
          review: 'Independent fixture review, exact tip approved',
        }),
      ],
      { stopReason: 'toolUse' },
    ),
    fauxAssistantMessage('Waiting for publication approval.'),
    fauxAssistantMessage('The fixture remote is intentionally not a GitHub publication target.'),
  ])
  const conversation = (await server.harness.conversation(id, context))!
  await (
    await conversation.submit({ type: 'input', content: 'Submit the verified fixture.' }, context)
  ).wait(context)
  await until(
    async () =>
      !!(await server.harness.snapshot(doc, 1 as ConversationId, context))?.queue[0]?.delivery,
  )
  const snapshot = (await server.harness.snapshot(
    doc,
    1 as ConversationId,
    context,
  )) as WorkspaceIndex
  const entry = snapshot.queue[0]
  const delivery = entry.delivery!
  expect(delivery.stage).toBe('publish')
  expect(projectDecision(project, home)).toBe(false)
  expect(await projectSettings(project, home)).toEqual({})
  expect(await git(project, 'rev-parse', 'HEAD')).toBe(baseline)
  expect(await git(remote, 'rev-parse', 'main')).toBe(baseline)
  const args = {
    id: entry.id,
    candidate: delivery.candidate,
    tree: delivery.tree,
    action: 'publish',
  }
  const denied = await post(server, '/api/extensions/delivery-probe/actions/attempt', {
    args,
    conversationId: id,
  })
  // The probe runs as the submitting conversation, not @ultimate: an agent other than the root standing agent.
  expect(denied.status).toBe(500)
  expect(JSON.stringify(denied.data)).toContain('Only the user or @ultimate')
  const stale = await post(server, '/api/extensions/workspaces/actions/delivery', {
    args: { ...args, candidate: baseline },
  })
  expect(stale.status).toBe(500)

  const browser = await chromium.launch({
    executablePath: await browserBinary(),
    headless: true,
    env: { ...process.env, TMPDIR: undefined },
  })
  cleanup.push(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${server.url}/?conversation=${id}`)
  const card = page.getByRole('region', { name: 'PR delivery' })
  await card.getByRole('button', { name: 'Approve publication' }).waitFor()
  await page.screenshot({ path: '/tmp/ultimate-delivery-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/ultimate-delivery-mobile.png' })
  await card.getByRole('button', { name: 'Approve publication' }).click()
  await until(async () => {
    const value = (await server.harness.snapshot(
      doc,
      1 as ConversationId,
      context,
    )) as WorkspaceIndex
    return value.queue[0]?.delivery?.stage === 'blocked'
  })
  await card.getByText('Publication approved by you').waitFor()
  expect(await git(remote, 'rev-parse', 'main')).toBe(baseline)
  await card.getByRole('button', { name: /Stop delivery/ }).click()
  await until(
    async () =>
      (await server.harness.snapshot(doc, 1 as ConversationId, context))?.queue.length === 0,
  )
  const stopped = (await server.harness.snapshot(doc, 1 as ConversationId, context))!.results[
    entry.id
  ]
  expect(stopped.delivery?.candidate).toBe(delivery.candidate)
  expect(stopped.reason).toContain('Stopped by user')
})
