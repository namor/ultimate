import type { JsonValue } from '@earendil-works/chord'
import { onCommit } from '../../lib/commits.ts'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { obj, opt, str } from '@earendil-works/pi-schema'
import { strEnum } from '../../lib/schema.ts'
import {
  configure,
  defineExtension,
  defineTool,
  GenerationTask,
  hook,
  ROOT_CONVERSATION_ID,
  section,
  ToolTask,
} from '@earendil-works/pi-durable'
import type { ConversationId, EntryId, SubmissionId, Tx } from '@earendil-works/pi-durable'
import { implementAction } from '../../lib/actions.ts'
import type { ActionInput } from '../../lib/actions.ts'
import { empty, git, isolatable, noCommit, noRepository } from '../../lib/git.ts'
import type { ActionContext } from '../../server/actions.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { ConversationsApi, Release } from '../conversations/api.ts'
import { Branches, WorkspacesApi } from './api.ts'
import {
  DiskAction,
  DeliveryAction,
  GithubAction,
  InfoAction,
  IsolationAction,
  PendingAction,
  ProgressAction,
  StandingAction,
  StatsAction,
} from './refs.ts'
import { githubRepo } from '../../lib/project-identity.ts'
import { UserInputEvent } from '../../shared/events.ts'
import { standingRefusal } from './delivery.ts'
import type { Approval } from './delivery.ts'
import { sweepChecks } from './lander.ts'
import { Workspaces, workspaces } from './workspaces.ts'
export const order = -200
export const docs = [Workspaces]
export const userActions = ['setupGit']
const finish = (value: unknown) => ({
  output: [{ type: 'text' as const, text: JSON.stringify(value) }],
})
function workspaceId(args: ActionInput<{ id: number }>) {
  const id = args && typeof args === 'object' && !Array.isArray(args) ? args.id : undefined
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
    throw new Error('Expected a workspace conversation id')
  return id as ConversationId
}
async function setupGit(host: ExtensionHost) {
  const checkout = await isolatable(host.projectRoot)
  if (!('reason' in checkout)) return
  if (!(await empty(host.projectRoot)))
    throw new Error('This folder has files; ask the agent to choose what the first commit holds')
  if (checkout.reason === noRepository) await git(host.projectRoot, 'init')
  else if (checkout.reason !== noCommit) throw new Error(checkout.reason)
  await git(host.projectRoot, 'commit', '--allow-empty', '--message', 'Initial commit')
  await workspaces(host).standLander(context)
}

/**
 * Who acts on a delivery. A call from the browser (it carries a `device`) is the user's own click. Any other call is an
 * agent's: only @ultimate, the root standing agent, may make it, never while a hands-off goal is open, and only on the
 * user's recorded instruction: an entry in its conversation that a `user.input` event after the submission names,
 * carrying the browser `device` only the user's composer and answer card stamp. The entry's kind alone does not prove
 * the user wrote it: `messages/settle` writes a `board.message` from "user" in @ultimate's name, watchdog, update and
 * onboarding place plain `pi.user` inputs with text the server composed, and voice-live answers an open question with
 * text its model composed (an event without a device). Branches, subagents, side chats and automations run under their
 * own conversation ids, so they fail the first check. Docs are found by kind, not import: subagents and goal depend on
 * workspaces.
 */
/** Whether a hands-off goal is open; `tx` reads inside a commit, where a snapshot would wait on that commit. */
async function goalOpen(host: ExtensionHost, tx?: Tx) {
  const goals = host.doc('goal')
  if (!goals) return false
  const open = tx
    ? (await tx.doc(goals, ROOT_CONVERSATION_ID)).goals
    : (await host.harness().snapshot(goals, ROOT_CONVERSATION_ID, context))?.goals
  return Array.isArray(open) && open.some((goal) => !(goal as { ended?: unknown }).ended)
}
/** @ultimate's conversation id when `ctx` is @ultimate itself, else a refusal: no branch, side chat or automation. */
async function rootAgent(host: ExtensionHost, ctx: Pick<ActionContext, 'conversationId'>) {
  const standing = host.doc('ultimate.standing-agents')
  const ultimate =
    standing && (await host.harness().snapshot(standing, ROOT_CONVERSATION_ID, context))?.ultimate
  if (ctx.conversationId === undefined || ctx.conversationId !== ultimate)
    throw new Error("Only the user or @ultimate on the user's instruction can act on a delivery")
  return ultimate as ConversationId
}
/**
 * Whether entry `instruction` of @ultimate's conversation is an input the user typed or answered on a card, newer than
 * `since` when given; returns the entry id or throws.
 */
async function typedInstruction(
  host: ExtensionHost,
  ultimate: ConversationId,
  instruction: unknown,
  since?: number,
) {
  const harness = host.harness()
  if (typeof instruction !== 'number' || !Number.isSafeInteger(instruction))
    throw new Error(
      "Pass instruction: the entry id of the user's input that told you to act on this delivery",
    )
  const entry = await harness.commit((tx) => tx.entry(instruction as EntryId), context)
  if (!entry || entry.conversationId !== ultimate || (since !== undefined && entry.id <= since))
    throw new Error(
      since === undefined
        ? 'instruction must be an entry of your conversation'
        : 'instruction must be an entry of your conversation newer than this submission; the user decides on this candidate',
    )
  const message = entry.kind === 'board.message' ? (entry.data as { id?: unknown })?.id : undefined
  // The input's event commits right after its placement (or admission, when queued), so it lies between the submission
  // and the entries that followed the instruction; a bounded window keeps an old instruction findable.
  const events = await host.eventLog.recent({
    events: [UserInputEvent],
    ...(since !== undefined ? { since } : {}),
    before: entry.id + 1000,
    limit: 1000,
  })
  let typed = false
  for (const { data } of events) {
    if (data.conversation !== ultimate || !data.device || data.kind === 'dismiss') continue
    if (data.entry === entry.id || (message !== undefined && data.message === message)) typed = true
    else if (data.submission !== undefined) {
      const placed = await (
        await harness.submission(data.submission as SubmissionId, context)
      )?.status(context)
      if (placed?.entry === entry.id) typed = true
    }
    if (typed) break
  }
  if (!typed)
    throw new Error(
      'instruction must be an input the user typed in your conversation or answered on your card, not one written in their name',
    )
  return entry.id
}
async function approver(
  host: ExtensionHost,
  ctx: Pick<ActionContext, 'conversationId' | 'device'>,
  action: Approval['action'],
  args: { instruction?: unknown; standing?: unknown; reason?: unknown },
  submittedAt: number,
): Promise<Approval> {
  if (ctx.device) return { action, at: Date.now(), by: 'user' }
  const ultimate = await rootAgent(host, ctx)
  if (await goalOpen(host))
    throw new Error('A hands-off goal cannot approve a delivery; it waits for the user')
  if (args.standing === true) {
    if (typeof args.reason !== 'string' || !args.reason.trim())
      throw new Error('A standing approval needs reason: why this candidate is ready')
    // The grant and the delivery's evidence are judged together inside the approval's commit, which sets `standing`
    // to the grant's instruction entry.
    return {
      action,
      at: Date.now(),
      by: 'ultimate',
      conversation: ultimate,
      standing: 0,
      reason: args.reason.trim().slice(0, 240),
    }
  }
  const instruction = await typedInstruction(host, ultimate, args.instruction, submittedAt)
  return { action, at: Date.now(), by: 'ultimate', conversation: ultimate, instruction }
}

/** Most standing approval a grant may give: it is a temporary measure (#58492). */
const standingMaxHours = 7 * 24

export const actions = {
  delivery: implementAction(DeliveryAction, async (args, { host, conversationId, device }) => {
    if (
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args) ||
      typeof args.id !== 'string' ||
      typeof args.candidate !== 'string' ||
      typeof args.tree !== 'string' ||
      typeof args.action !== 'string' ||
      !['publish', 'merge', 'recheck', 'stop'].includes(args.action)
    )
      throw new Error('Expected an immutable delivery approval')
    const action = args.action as Approval['action']
    const bound = (entry: { delivery?: { candidate: string; tree: string } } | undefined) =>
      entry?.delivery !== undefined &&
      entry.delivery.candidate === args.candidate &&
      entry.delivery.tree === args.tree
    const seen = (
      await host.harness().snapshot(Workspaces, ROOT_CONVERSATION_ID, context)
    )?.queue.find((item) => item.id === args.id)
    if (!seen || !bound(seen)) throw new Error('Delivery candidate changed; approval refused')
    const approval = await approver(host, { conversationId, device }, action, args, seen.at)
    await host.harness().commit(async (tx) => {
      const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
      const entry = index.queue.find((item) => item.id === args.id)
      const delivery = entry?.delivery
      if (!entry || !delivery || !bound(entry))
        throw new Error('Delivery candidate changed; approval refused')
      // The instruction was judged against the snapshot's submission point; a reassessment in between moved it.
      if (entry.at !== seen.at)
        throw new Error('Delivery was reassessed; the user must decide on the new assessment')
      if (approval.by === 'ultimate' && (await goalOpen(host, tx)))
        throw new Error('A hands-off goal cannot approve a delivery; it waits for the user')
      if (approval.standing !== undefined) {
        const refusal = standingRefusal(index.standing, delivery, action, Date.now())
        if (refusal) throw new Error(`Standing approval refused: ${refusal}`)
        approval.standing = index.standing!.instruction
      }
      // One instruction decides one delivery: the user's words about this candidate approve no other.
      if (
        approval.instruction !== undefined &&
        [...index.queue, ...Object.entries(index.results).map(([id, r]) => ({ id, ...r }))].some(
          (item) =>
            item.id !== entry.id &&
            item.delivery?.approvals?.some((a) => a.instruction === approval.instruction),
        )
      )
        throw new Error(
          'instruction already decided another delivery; the user must decide this one',
        )
      delivery.approvals = [...(delivery.approvals ?? []), approval]
      if (action === 'stop' && delivery.stage === 'blocked') {
        if ((delivery.createIntent && !delivery.pr) || delivery.mergeIntent)
          throw new Error('Reconcile the uncertain write before stopping this delivery')
        index.results[entry.id] = {
          outcome: 'failed',
          reason: `Stopped by ${approval.by === 'user' ? 'user' : "@ultimate on the user's instruction"}; remote branch and PR were not changed`,
          delivery,
          at: entry.at,
          divergence: entry.divergence,
          target: entry.target,
          tip: entry.tip,
          lander: index.landerConversations[entry.source],
          steps: entry.steps,
          conversationId: entry.conversationId,
          ...(entry.subject ? { subject: entry.subject } : {}),
        }
        index.queue = index.queue.filter((item) => item.id !== entry.id)
      } else if (action === 'publish' && delivery.stage === 'publish')
        delivery.publishApproved = true
      else if (action === 'merge' && delivery.stage === 'merge') delivery.mergeApproved = true
      else if (action === 'recheck' && delivery.stage === 'blocked' && delivery.resumeStage) {
        delivery.stage = delivery.resumeStage
        delete delivery.reason
        delivery.deadline = Date.now() + 60 * 60 * 1000
      } else throw new Error('Delivery stage changed; reload its card')
      if (action === 'publish' || action === 'merge')
        delivery.deadline = Date.now() + 60 * 60 * 1000
    }, context)
    await workspaces(host).resume(context)
    host.harness().resume()
    return { ok: true as const }
  }),
  /**
   * Grant or revoke the standing delivery approval. Only @ultimate grants, on the user's typed instruction `instruction`
   * (newer than the last grant's: no renewal without new words), for `hours` (default 24, at most a week). The user's
   * click revokes; so may @ultimate, on the user's word. A hands-off goal can do neither.
   */
  standing: implementAction(StandingAction, async (args, { host, conversationId, device }) => {
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw new Error('Expected { grant } or { revoke }')
    if (args.revoke === true) {
      const by = device ? ('user' as const) : ('ultimate' as const)
      if (!device) await rootAgent(host, { conversationId })
      await host.harness().commit(async (tx) => {
        const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
        if (index.standing && index.standing.revokedAt === undefined) {
          index.standing.revokedAt = Date.now()
          index.standing.revokedBy = by
        }
      }, context)
      return { ok: true as const }
    }
    if (device) throw new Error('Tell @ultimate to grant a standing approval; it records your words')
    const ultimate = await rootAgent(host, { conversationId })
    if (await goalOpen(host))
      throw new Error('A hands-off goal cannot grant a standing approval; it waits for the user')
    const hours = args.hours ?? 24
    if (typeof hours !== 'number' || !(hours > 0) || hours > standingMaxHours)
      throw new Error(`hours must be more than 0 and at most ${standingMaxHours}`)
    const instruction = await typedInstruction(host, ultimate, args.instruction)
    const at = Date.now()
    const grant = { instruction, conversation: ultimate, at, until: at + hours * 3600_000 }
    await host.harness().commit(async (tx) => {
      const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
      if (index.standing && index.standing.instruction >= instruction)
        throw new Error('Renewing a standing approval needs a newer instruction from the user')
      if (await goalOpen(host, tx))
        throw new Error('A hands-off goal cannot grant a standing approval; it waits for the user')
      index.standing = grant
    }, context)
    return grant
  }),
  /** `github.com/<owner>/<repo>` of the project's `origin`, or null off GitHub: landing cards link ranges. */
  github: implementAction(
    GithubAction,
    async (_args, { host }) => (await githubRepo(host.projectRoot)) ?? null,
  ),
  progress: implementAction(ProgressAction, (args, { host }) => {
    const ids = args && typeof args === 'object' && !Array.isArray(args) ? args.ids : undefined
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
    )
      throw new Error('Expected at most 100 conversation ids')
    return workspaces(host).progress(ids as number[], context)
  }),
  pending: implementAction(PendingAction, (args, { host }) => {
    const ids = args && typeof args === 'object' && !Array.isArray(args) ? args.ids : undefined
    if (
      !Array.isArray(ids) ||
      ids.some((id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
    )
      throw new Error('Expected workspace conversation ids')
    return workspaces(host).pending(ids as number[], context)
  }),
  async create(args: JsonValue, { host }: ActionContext) {
    const input = (args ?? {}) as { cwd?: string; title?: string }
    if (input.cwd !== undefined && typeof input.cwd !== 'string')
      throw new Error('cwd must be a string')
    if (input.title !== undefined && typeof input.title !== 'string')
      throw new Error('title must be a string')
    const root = (await host.harness().conversation(ROOT_CONVERSATION_ID, context))!
    const agent = await root.agent(context)
    const id = await host.harness().commit(async (tx) => {
      const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } })
      await configure(tx, conversation.id, {
        model: agent.model,
        thinkingLevel: agent.thinkingLevel,
      })
      if (input.title) (await tx.doc(host.metadata, conversation.id)).title = input.title
      await workspaces(host).create(tx, conversation.id, input.cwd ?? host.projectRoot)
      return conversation.id
    }, context)
    host.harness().resume()
    return { id }
  },
  /**
   * Why the project cannot start isolated conversations, if it cannot, and whether its folder is still empty, so
   * `setupGit` can make the first commit. Once it can, the project's lander is stood if it has none yet, so a first
   * commit made in a conversation brings the lander without a restart.
   */
  isolation: implementAction(IsolationAction, async (_args, { host }) => {
    const checkout = await isolatable(host.projectRoot)
    if ('reason' in checkout)
      return { reason: checkout.reason, empty: await empty(host.projectRoot) }
    const index = await host.harness().snapshot(Workspaces, ROOT_CONVERSATION_ID, context)
    if (index?.landerConversations[checkout.source] === undefined)
      await workspaces(host).standLander(context)
    return {}
  }),
  /**
   * Make an empty folder isolatable: `git init` where there is no repository, then an empty first commit. A folder
   * with files needs judgement about what to commit, so it is left to an agent.
   */
  async setupGit(_args: JsonValue, { host }: ActionContext) {
    await setupGit(host)
    return {}
  },
  info: implementAction(InfoAction, (args, { host }) =>
    workspaces(host).info(workspaceId(args), context),
  ),
  discard(args: JsonValue, { host }: ActionContext) {
    return workspaces(host).discard(workspaceId(args), context)
  },
  stats: implementAction(StatsAction, (_args, { host }) => workspaces(host).stats(context)),
  disk: implementAction(DiskAction, (_args, { host }) => workspaces(host).disk()),
}
export default function workspaceExtension(host: ExtensionHost) {
  // What a landing asks about its branch is an extension point, wanted where the lander calls it.
  host.want(Branches)
  const conversations = host.need(ConversationsApi)
  const service = workspaces(host)
  host.implement(WorkspacesApi, {
    ...service,
    git,
    doc: Workspaces,
    setupGit: () => setupGit(host),
  })
  // Concluding conversations frees their worktrees, through conversations' extension point.
  host.implement(Release, { release: (ids, caller) => service.release(ids, caller) })
  const resume = () =>
    service.resume(context).catch((error: unknown) => {
      host.notice(`Lander resume failed: ${String(error)}`)
    })
  let unsubscribe: (() => void) | undefined
  let releasing: Promise<unknown> | undefined
  let releaseController: AbortController | undefined
  // A lander task that faults leaves its queue behind. One run by older code, as on a reload of this code that changed
  // the Workspaces document, is replaced at once; a fault of this code's own task would only repeat, so it waits for
  // the next submit or open. Opening (and each reload while open) picks up any such queue. An aborted task stays
  // stopped until then too.
  const stand = () =>
    service.standLander(context).catch((error: unknown) => {
      host.notice(`Lander setup failed: ${String(error)}`)
    })
  host.onOpen(async () => {
    releaseController = new AbortController()
    const { signal } = releaseController
    releasing = conversations
      .concluded(context)
      .then((ids) => service.release([...ids], context, signal))
      // Checkouts an earlier chapter made: no record here knows them, so the concluded list never frees them.
      .then(() => service.sweep(context, signal))
      .catch((error: unknown) => {
        host.notice(`Workspace release failed: ${String(error)}`)
      })
    unsubscribe?.()
    // Not a reactor: a lander task's fault is a Pi task record, not a domain event.
    unsubscribe = onCommit(host.harness(), (publication) => {
      for (const change of publication.changes) {
        if (
          change.type !== 'task' ||
          change.value.kind !== service.Lander.definition.name ||
          change.value.state.status !== 'terminal' ||
          change.value.state.outcome.status !== 'faulted'
        )
          continue
        if (service.started.has(change.value.id))
          host.notice(
            `Lander task ${change.value.id} faulted: ${change.value.state.outcome.error.message}; its queue resumes on the next submit or restart`,
          )
        // oxlint-disable-next-line typescript/no-floating-promises -- resume catches failures and reports them through host.notice.
        else void resume()
      }
    })
    await stand()
    // Checks a crashed host left running would compete with the resumed lander's own run of them.
    await sweepChecks(host.home).catch((error: unknown) => {
      host.notice(`Lander check sweep failed: ${String(error)}`)
    })
    await resume()
  })
  host.onClose(async () => {
    releaseController?.abort()
    await releasing
    unsubscribe?.()
    unsubscribe = undefined
  })
  return defineExtension({
    name: 'workspaces',
    tasks: [service.Preparation, service.Lander],
    hooks: [
      hook(ToolTask, {
        beforeTool: async (_call, api, caller) => {
          const reason = await service.unavailable(api.conversationId, caller)
          return reason ? { block: reason } : undefined
        },
      }),
      // The lander conversation is its log: no model runs there.
      hook(GenerationTask, {
        beforeInput: async (_input, api) => {
          const index = await api.tx.doc(Workspaces, ROOT_CONVERSATION_ID)
          if (Object.values(index.landerConversations).includes(api.conversationId))
            throw new Error('The lander runs no model; its conversation is the landing log')
          return undefined
        },
      }),
    ],
    tools: [
      defineTool({
        name: 'workspace',
        description:
          'Inspect your workspace and source tips, or submit your clean, verified tip to the lander (submit requires divergence from the original request).',
        parameters: obj({
          action: strEnum(['status', 'submit']),
          risk: opt(strEnum(['low', 'medium', 'high'])),
          reviewedTree: opt(
            str({
              description:
                'Tree SHA covered by the independent review. Defaults to this workspace tip tree; supply the integration tree when delivery requests renewed review.',
            }),
          ),
          review: opt(
            str({
              description:
                'PR mode requires independent final-review evidence for this exact tip: reviewer conversation and immutable range, with no blocking findings.',
            }),
          ),
          divergence: opt(
            str({
              description:
                "Required for submit. How the delivered result differs from what was originally asked: new agreements, a different approach or library, changed scope. Say 'None' when it matches.",
            }),
          ),
        }),
        async execute({ action, divergence, risk, review, reviewedTree }, api, caller) {
          if (action === 'status')
            return finish({
              conversationId: api.conversationId,
              workspace: await service.info(api.conversationId, caller),
            })
          await api.commit(async (tx) => {
            const row = await tx.conversation(api.conversationId)
            if (
              !row ||
              row.owner ||
              Object.values(
                (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).landerConversations,
              ).includes(api.conversationId)
            )
              throw new Error(`Only a top-level main conversation can ${action} its own workspace`)
          }, caller)
          return finish(
            await service.submit(
              api.conversationId,
              divergence ?? '',
              caller,
              risk && review
                ? { risk, review, ...(reviewedTree ? { reviewedTree } : {}) }
                : undefined,
            ),
          )
        },
      }),
    ],
    sections: [
      section('workspace_workflow', async (input, caller) => {
        await service.ready(input.conversationId, caller)
        const own = await service.get(input.conversationId, caller)
        if (!own) return undefined
        const head = `Workspace: ${own.path} (branch ${own.branch}).\nSource: ${own.source}, target: ${own.target}.\n\`workspace status\` shows both tips.`
        // Ownership never changes, so each conversation keeps one fixed text.
        const row = await host
          .harness()
          .commit((tx) => tx.conversation(input.conversationId), caller)
        if (row?.owner)
          return `${head} You are a subagent: commit your verified work in this worktree and report the commit to your owner, who lands it. Only a top-level conversation can \`workspace submit\`.`
        return `${head} Finish with \`workspace submit\` once your tip is committed and verified: the lander merges it into ${own.target} with whatever landed meanwhile, runs the project's checks, fast-forwards ${own.target} and pushes when configured; keep working meanwhile and do not merge ${own.target} yourself first. A failure comes back to you as a message: fix it and submit again. A landing reaches whoever started you as its card, and concludes you unless other work is still under way.`
      }),
    ],
  })
}
