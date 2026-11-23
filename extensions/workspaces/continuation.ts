import { defineTask, InboxDoc, LiveDoc, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import type {
  ConversationDocToken,
  ConversationId,
  EntryId,
  SubmissionId,
  Tx,
} from '@earendil-works/pi-durable'
import { parseConversationId } from '../../lib/ids.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { ConversationsApi } from '../conversations/api.ts'
import type { WorkspaceIndex } from './types.ts'
import { Branches } from './api.ts'

type Result = WorkspaceIndex['results'][string]
type Wake = {
  owner: ConversationId
  key: EntryId
  submission: string
  result: 'landed' | 'failed'
  admitted?: SubmissionId
}
const complete = { status: 'terminal', outcome: { status: 'completed', result: null } } as const

export function continuationTask(
  host: Pick<ExtensionHost, 'need' | 'want' | 'harness'>,
  doc: ConversationDocToken<WorkspaceIndex>,
) {
  return defineTask<
    Wake,
    | { phase: 'deliver' }
    | { phase: 'observe'; admitted: SubmissionId; overlapping?: SubmissionId[] },
    null
  >({
    name: 'workspaces.continuation',
    version: 1,
    initial: (input) =>
      input.admitted === undefined
        ? { phase: 'deliver' }
        : { phase: 'observe', admitted: input.admitted },
    phases: {
      deliver: async ({ input }, runtime, ctx) => {
        const owner = await runtime.conversation(input.owner, ctx)
        await runtime.commit(async (tx) => {
          const index = await tx.doc(doc, ROOT_CONVERSATION_ID)
          const current = index.items[String(input.owner)]?.continuation
          if (
            owner &&
            current?.state === 'needs-action' &&
            current.key === input.key &&
            current.submission === input.submission &&
            !(await host.need(ConversationsApi).concludedIn(tx)).has(input.owner)
          ) {
            const content = `Submission ${input.submission} ${input.result}. Your workspace delivery is still open: ${current.outcome}. Read workspace status; only act if continuation ${current.key} still names this submission. Inspect the result and test whether this dependency is needed. Take the next authorized action or arrange an acknowledged handoff. This result does not release verifier capacity or authorize a retry.`
            const admitted = await owner.submit(tx, {
              type: 'input',
              whenBusy: 'followUp',
              content,
              requestId: `workspaces.continuation:${current.key}:${input.submission}`,
              entry: {
                kind: 'workspaces.continuation',
                data: { key: current.key, submission: input.submission },
              },
            })
            return { status: 'running', checkpoint: { phase: 'observe', admitted } }
          }
          return complete
        }, ctx)
      },
      observe: async ({ input, state }, runtime, ctx) => {
        const { admitted, overlapping } = state.checkpoint
        for (const id of overlapping ?? [admitted]) {
          const receipt = await host.harness().submission(id, ctx)
          await receipt?.wait(ctx)
        }
        const branches = host.want(Branches)
        const starter = await branches?.starter(input.owner, ctx)
        const to =
          starter !== undefined &&
          starter !== input.owner &&
          (await runtime.conversation(starter, ctx))
        await runtime.commit(async (tx) => {
          const current = (await tx.doc(doc, ROOT_CONVERSATION_ID)).items[String(input.owner)]
            ?.continuation
          if (
            to &&
            current?.key === input.key &&
            current.submission === input.submission &&
            current.state === 'needs-action' &&
            !(await host.need(ConversationsApi).concludedIn(tx)).has(input.owner)
          ) {
            if (!overlapping) {
              const active = (await tx.doc(LiveDoc, input.owner)).run?.inputs ?? []
              const queued = (await tx.doc(InboxDoc, input.owner)).items
                .filter((i) => i.mode !== 'write')
                .map((i) => i.id)
              const pending = [...new Set([...active, ...queued])].filter((id) => id !== admitted)
              if (pending.length)
                return {
                  status: 'running',
                  checkpoint: { phase: 'observe', admitted, overlapping: pending },
                }
            }
            await to.submit(tx, {
              type: 'input',
              whenBusy: 'followUp',
              requestId: `workspaces.continuation:handoff:${input.key}:${input.submission}`,
              content: `Workspace #${input.owner} has an open delivery after ${input.submission} ${input.result}. No next attempt or prerequisite was linked. Check the owner's current work and pending replies before acting; diagnose before retrying. No approval or verifier capacity was transferred.`,
            })
          }
          return complete
        }, ctx)
      },
    },
    abort: (_task, runtime, ctx) =>
      runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), ctx),
  })
}

export async function resolveContinuations(
  tx: Tx,
  index: WorkspaceIndex,
  submission: string,
  task: ReturnType<typeof continuationTask>,
  reportsToSubmitter: boolean,
) {
  const result = index.results[submission]
  for (const [id, item] of Object.entries(index.items)) {
    const wait = item.continuation
    if (wait?.state !== 'waiting' || wait.submission !== submission) continue
    const owner = parseConversationId(Number(id))
    if (
      wait.tracks === 'delivery' &&
      owner === result.conversationId &&
      result.outcome === 'landed' &&
      !result.reason
    ) {
      delete item.continuation
      continue
    }
    wait.state = 'needs-action'
    if (reportsToSubmitter && owner === result.conversationId && result.outcome === 'failed')
      continue
    await tx.createTask(
      task,
      { owner, key: wait.key, submission, result: result.outcome },
      { conversationId: owner, ownership: { kind: 'conversation' }, background: true },
    )
  }
}

export async function follow(
  tx: Tx,
  index: WorkspaceIndex,
  owner: ConversationId,
  after: string,
  outcome: string,
  tracks: 'delivery' | 'prerequisite',
  previous?: number,
) {
  const item = index.items[String(owner)]
  if (!item || item.state !== 'ready')
    throw new Error('Only a ready workspace can follow a submission')
  const current = item.continuation
  if (current?.key !== previous)
    throw new Error('Continuation changed; inspect workspace status first')
  const queued = index.queue.find((entry) => entry.id === after)
  const result: Result | undefined = Object.hasOwn(index.results, after)
    ? index.results[after]
    : undefined
  if (!(queued || result))
    throw new Error(
      'No such queued submission or retained result. Do not wait for an unsubmitted prerequisite; reassess it or request an acknowledged handoff.',
    )
  const source = queued?.source ?? index.items[String(result?.conversationId)]?.source
  if (source !== item.source) throw new Error('The submission is not in this source checkout')
  if (!outcome.trim() || outcome.length > 500)
    throw new Error('Name the approved workspace delivery in at most 500 characters')
  if (current && current.outcome !== outcome.trim())
    throw new Error('Do not replace an open delivery with a different outcome')
  const key = (await tx.appendEntry(owner, { kind: 'workspaces.follow', data: { after } })).id
  item.continuation = {
    key,
    outcome: outcome.trim(),
    submission: after,
    tracks,
    state: result ? 'needs-action' : 'waiting',
  }
  return item.continuation
}
