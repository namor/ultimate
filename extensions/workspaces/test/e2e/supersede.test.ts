import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import { afterEach, expect, it, vi } from 'vitest'
import { git } from '../../../../lib/git.ts'
import type { ExtensionHost } from '../../../../server/extensions.ts'
import { context, prepareHarness } from '../../../../server/harness.ts'
import type { OpenHost } from '../../../../server/harness.ts'
import { Metadata } from '../../../../server/metadata.ts'
import { temp, until } from '../../../../test/helpers.ts'
import * as advance from '../../advance.ts'
import { pullRequestText } from '../../pull-request.ts'
import { waits } from '../../delivery.ts'
import workspaceExtension from '../../server.ts'
import { Workspaces, workspaces } from '../../workspaces.ts'

const openedHosts: OpenHost[] = []
afterEach(async () => {
  for (const opened of openedHosts.splice(0)) await opened.close()
  vi.restoreAllMocks()
})

async function fixture() {
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
    emit: async () => {},
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
  return { harness, service, id, workspace, commit, tree, conversation, directory, projectRoot }
}

async function resubmit(mergeIntent: boolean, runtimeChanged = false) {
  const { harness, service, id, workspace, commit, tree, conversation } = await fixture()
  const other = await conversation()
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
      runtime: runtimeChanged ? 'old-runtime' : advance.deliveryRuntime(),
      stage: 'blocked',
      cause: runtimeChanged ? 'runtime' : 'check-failed',
      resumeStage: 'ci',
      reason: runtimeChanged
        ? 'Local verification ran on another runtime'
        : 'Required GitHub check verify: failure',
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
    reviewedTree: runtimeChanged ? tree : await commit('replacement tip'),
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

it('rebuilds with the renewed review and without the public copy its owner withdrew', async () => {
  const { harness, service, id, workspace, tree, directory, projectRoot } = await fixture()
  const remote = join(directory, 'remote.git')
  await git(directory, 'clone', '--bare', projectRoot, remote)
  await git(projectRoot, 'remote', 'add', 'origin', remote)
  vi.spyOn(advance, 'github').mockReturnValue(
    async () => ({ commit: { sha: workspace.base } }) as never,
  )
  const settings = {
    repository: 'example/my-app',
    base: 'main',
    remote: 'origin',
    checks: ['test -f change.txt'],
    requiredChecks: ['verify'],
  }
  const old = {
    risk: 'low' as const,
    review: 'original review',
    reviewedTree: await git(projectRoot, 'rev-parse', 'HEAD^{tree}'),
    pullRequest: { title: 'Withdrawn title', body: 'Withdrawn wording' },
  }
  await service.submit(id, 'None', context, old)
  await harness.commit(async (tx) => {
    const entry = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue[0]
    entry.deliveryConfig = settings
    entry.delivery = {
      ...old,
      settings,
      candidate: entry.tip,
      baseline: workspace.base,
      tree,
      branch: 'ultimate-delivery/test',
      checkedAt: Date.now(),
      runtime: advance.deliveryRuntime(),
      stage: 'review',
    }
  }, context)
  const revised = { risk: 'high' as const, review: 'renewed review', reviewedTree: tree }
  await service.submit(id, 'None', context, revised)
  // Resume at the durable checkpoint after the stale candidate was discarded.
  await harness.commit(async (tx) => {
    const entry = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue[0]
    delete entry.delivery
    entry.rebuilds = 1
    entry.state = 'queued'
  }, context)
  harness.release()
  const snapshot = () => harness.snapshot(Workspaces, ROOT_CONVERSATION_ID, context)
  await until(async () => !!(await snapshot())?.queue[0]?.delivery)
  const rebuilt = (await snapshot())!.queue[0].delivery!
  expect(rebuilt).toMatchObject({
    review: revised.review,
    risk: revised.risk,
    stage: 'publish',
    tree,
  })
  expect(rebuilt.publishApproved).toBeUndefined()
  const payload = pullRequestText(rebuilt)
  expect(payload.title).not.toContain('Withdrawn')
  expect(payload.body).not.toContain('Withdrawn')
  expect(payload.body).toContain('Risk: high')
  expect(payload.body).toContain(rebuilt.candidate)
  expect(payload.body).toContain(tree)
})

it('supersedes a runtime-blocked delivery on the same tip and clears its active approvals', async () => {
  const { index, oldId, newId, assessment } = await resubmit(false, true)
  const old = index.results[oldId]
  expect(newId).not.toBe(oldId)
  expect(old.delivery?.approvals).toEqual([
    { action: 'publish', at: expect.any(Number), by: 'user' },
  ])
  const replacement = index.queue.find((item) => item.id === newId)!
  expect(replacement).toMatchObject({ tip: old.tip, state: 'queued', assessment })
  expect(replacement.delivery).toBeUndefined()
  expect(replacement.approvals).toBeUndefined()
})

it('queues the replacement behind a delivery with an uncertain merge', async () => {
  const { index, oldId, newId } = await resubmit(true)
  expect(index.queue.map((item) => item.id)).toEqual([oldId, 'unrelated', newId])
  expect(index.queue[2].state).toBe('queued')
  expect(index.results[oldId]).toBeUndefined()
})
