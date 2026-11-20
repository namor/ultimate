import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import { afterEach, expect, it } from 'vitest'
import { git } from '../../../../lib/git.ts'
import type { ExtensionHost } from '../../../../server/extensions.ts'
import { context, prepareHarness } from '../../../../server/harness.ts'
import type { OpenHost } from '../../../../server/harness.ts'
import { Metadata } from '../../../../server/metadata.ts'
import { temp } from '../../../../test/helpers.ts'
import { deliveryRuntime } from '../../advance.ts'
import { waits } from '../../delivery.ts'
import workspaceExtension from '../../server.ts'
import { Workspaces, workspaces } from '../../workspaces.ts'

const openedHosts: OpenHost[] = []
afterEach(async () => {
  for (const opened of openedHosts.splice(0)) await opened.close()
})

async function resubmit(mergeIntent: boolean) {
  const directory = await temp('ultimate-supersede-')
  const projectRoot = join(directory, 'project')
  await mkdir(projectRoot)
  await git(projectRoot, 'init', '-b', 'main')
  await git(projectRoot, 'config', 'user.email', 'test@example.com')
  await git(projectRoot, 'config', 'user.name', 'Test')
  await git(projectRoot, 'commit', '--allow-empty', '-m', 'base')
  const prepared = await prepareHarness({
    projectRoot,
    home: join(directory, 'state'),
    userHome: directory,
    ultimateRoot: projectRoot,
  })
  let opened: OpenHost
  const resources = new Map<string, unknown>()
  const host = {
    ...prepared,
    harness: () => opened.harness,
    metadata: Metadata,
    implement: () => {},
    need: () => ({ subject: async () => undefined, setStanding: async () => {} }),
    want: () => undefined,
    projectSettings: async () => ({}),
    extensions: () => [{ name: 'workspaces', enabled: true }],
    resource<T>(key: string, create: () => T): T {
      if (!resources.has(key)) resources.set(key, create())
      return resources.get(key) as T
    },
    onOpen: () => {},
    onClose: () => {},
  } as unknown as ExtensionHost
  prepared.registry.install(workspaceExtension(host))
  opened = await prepared.open()
  openedHosts.push(opened)
  const { harness } = opened
  const service = workspaces(host)
  const conversation = () =>
    harness.createConversation({ ownership: { kind: 'ownerless' } }, context)
  const { id } = await conversation()
  const other = await conversation()
  await harness.commit(async (tx) => {
    await tx.appendEntry(id, { kind: 'test.submit-point' })
    await service.create(tx, id, projectRoot)
  }, context)
  await service.ready(id, context)
  const workspace = (await service.get(id, context))!
  const commit = async (text: string) => {
    await writeFile(join(workspace.path, 'change.txt'), text)
    await git(workspace.path, 'add', 'change.txt')
    await git(workspace.path, 'commit', '-m', text)
    return git(workspace.path, 'rev-parse', 'HEAD^{tree}')
  }
  const tree = await commit('first tip')
  // Test submit's transaction without letting the asynchronous lander consume the queue.
  harness.hold()
  const { id: oldId } = await service.submit(id, 'None', context)
  await harness.commit(async (tx) => {
    const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
    const entry = index.queue.find((item) => item.id === oldId)!
    const at = (await tx.appendEntry(other.id, { kind: 'test.submit-point' })).id
    index.queue.push({ ...entry, id: 'unrelated', conversationId: other.id, at, state: 'queued' })
    entry.state = 'waiting'
    entry.delivery = {
      settings: {
        repository: 'example/my-app',
        remote: 'origin',
        base: 'main',
        checks: ['verify'],
        requiredChecks: ['verify'],
      },
      risk: 'high',
      review: 'first tip review',
      baseline: workspace.base,
      candidate: entry.tip,
      tree,
      branch: 'ultimate-delivery/test',
      checkedAt: Date.now(),
      runtime: deliveryRuntime(),
      stage: 'blocked',
      cause: 'check-failed',
      resumeStage: 'ci',
      reason: 'Required GitHub check verify: failure',
      pr: 33,
      url: 'https://github.com/example/my-app/pull/33',
      publishApproved: true,
      approvals: [{ action: 'publish', at: Date.now(), by: 'user' }],
      wake: { block: 1, to: 'branch' },
      ...(mergeIntent ? { mergeIntent } : {}),
    }
  }, context)
  const assessment = {
    risk: 'low' as const,
    review: 'reviewer #9 approved',
    reviewedTree: await commit('replacement tip'),
  }
  const { id: newId } = await service.submit(id, 'None', context, assessment)
  const index = (await harness.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))!
  return { index, oldId, newId, assessment }
}

it('supersedes a delivery blocked by required CI without asking the user to stop it (PR #33)', async () => {
  const { index, oldId, newId, assessment } = await resubmit(false)
  expect(index.queue.map((item) => item.id)).toEqual(['unrelated', newId])
  const result = index.results[oldId]
  expect(result).toMatchObject({ outcome: 'failed', delivery: { pr: 33 } })
  expect(result.reason?.startsWith(`Superseded by ${newId}`)).toBe(true)
  expect(result.reason).toContain('its PR is closed')
  expect(index.closing).toContainEqual(
    expect.objectContaining({ repository: 'example/my-app', pr: 33 }),
  )
  const replacement = index.queue.find((item) => item.id === newId)!
  expect(replacement).toMatchObject({ state: 'queued', assessment })
  // Approvals live on the delivery, so a fresh entry with no delivery has none.
  expect(replacement.delivery).toBeUndefined()
  expect(index.queue.filter(({ delivery }) => delivery && waits(delivery)?.on === 'user')).toEqual(
    [],
  )
})

it('queues the replacement behind a delivery with an uncertain merge', async () => {
  const { index, oldId, newId } = await resubmit(true)
  expect(index.queue.map((item) => item.id)).toEqual([oldId, 'unrelated', newId])
  expect(index.queue[2].state).toBe('queued')
  expect(index.results[oldId]).toBeUndefined()
})
