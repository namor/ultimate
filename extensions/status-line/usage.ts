import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { UsageDoc } from '@earendil-works/pi-durable'
import type {
  ConversationId,
  ConversationRecord,
  Cursor,
  UsageState,
} from '@earendil-works/pi-durable'
import type { ExtensionHost } from '../../server/extensions.ts'
import { shortTitle } from '../../lib/title.ts'
import type { ConversationUsage, SubtreeUsage, UsageFigures } from './refs.ts'

const counters = [
  'input',
  'output',
  'cacheRead',
  'cacheWrite',
  'cacheWrite1h',
  'reasoning',
  'cost',
] as const
const known = (value: number | undefined): number | null =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? value : null
const figures = (bucket: UsageState['models'][string]): UsageFigures => ({
  input: known(bucket.input),
  output: known(bucket.output),
  cacheRead: known(bucket.cacheRead),
  cacheWrite: known(bucket.cacheWrite),
  cacheWrite1h: known(bucket.cacheWrite1h),
  reasoning: known(bucket.reasoning),
  cost: known(bucket.cost?.total),
})
const sum = (buckets: UsageFigures[]): UsageFigures =>
  Object.fromEntries(
    counters.map((key) => [
      key,
      buckets.length && buckets.every((bucket) => bucket[key] !== null)
        ? buckets.reduce((total, bucket) => total + bucket[key]!, 0)
        : null,
    ]),
  ) as UsageFigures

/** Native pi.usage is own spend and starts empty on fork; never add inherited history or parent-inclusive totals. */
export async function subtreeUsage(
  host: Pick<ExtensionHost, 'harness' | 'metadata'>,
  conversation: ConversationId,
): Promise<SubtreeUsage> {
  const harness = host.harness()
  const tree = await harness.commit(async (tx) => {
    const root = await tx.conversation(conversation)
    if (!root) throw new Error(`Unknown conversation ${conversation}`)
    const children = new Map<ConversationId, ConversationRecord[]>()
    let cursor: Cursor | undefined
    do {
      const page = await tx.scanConversations({}, 256, cursor)
      for (const record of page.items) {
        if (!record.owner) continue
        const owner = record.owner.conversationId
        const siblings = children.get(owner) ?? []
        siblings.push(record)
        children.set(owner, siblings)
      }
      cursor = page.next
    } while (cursor !== undefined)
    const found = new Map([[root.id, root]])
    for (const record of found.values())
      for (const child of children.get(record.id) ?? [])
        if (!found.has(child.id)) found.set(child.id, child)
    return [...found.values()]
  }, context)
  const conversations: ConversationUsage[] = []
  for (const record of tree) {
    // ponytail: like Harness.usage(), snapshots are read in sequence; this is a checkpoint, not an atomic live meter.
    const usage = await harness.snapshot(UsageDoc, record.id, context)
    const metadata = await harness.snapshot(host.metadata, record.id, context)
    const models = Object.fromEntries(
      Object.entries(usage?.models ?? {}).map(([key, value]) => [key, figures(value)]),
    )
    const tools = Object.fromEntries(
      Object.entries(usage?.tools ?? {}).map(([key, value]) => [key, figures(value)]),
    )
    conversations.push({
      id: record.id,
      ...(record.owner ? { owner: record.owner.conversationId } : {}),
      ...(metadata?.label ? { label: metadata.label } : {}),
      ...(metadata?.title ? { title: shortTitle(metadata.title) } : {}),
      totals: sum([...Object.values(models), ...Object.values(tools)]),
      models,
      tools,
    })
  }
  const buckets = (kind: 'models' | 'tools') => {
    const groups = new Map<string, UsageFigures[]>()
    for (const row of conversations)
      for (const [key, value] of Object.entries(row[kind])) {
        const group = groups.get(key) ?? []
        group.push(value)
        groups.set(key, group)
      }
    return Object.fromEntries([...groups].map(([key, values]) => [key, sum(values)]))
  }
  return {
    conversation,
    observedAt: new Date().toISOString(),
    totals: sum(conversations.map((row) => row.totals)),
    models: buckets('models'),
    tools: buckets('tools'),
    conversations,
    coverage: [
      'Own recorded usage for this conversation and owned descendants, once each; includes recorded summary/compaction and failed/aborted attempt usage. Fork-source history and unrelated conversations are excluded.',
      'Missing counters or empty usage are unknown, not zero. Native buckets cannot reveal unreported attempts, request IDs, or whether every request reported an optional counter. Streaming usage is excluded; reads are sequential.',
      'Reasoning is part of output; 1h cache writes are part of cache writes. Cost is the recorded dollar value, which may be zero for subscriptions; it is not subscription quota.',
      'Labels identify existing conversation roles. Task/stage attribution is by the selected conversation and its plan child link, not inferred from messages. Other chapters are excluded.',
    ],
  }
}
