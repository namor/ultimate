/** The status line in the browser: token rates and spend across every conversation of this host. Browser-safe. */
import { actionRef } from '../../shared/extension-api.ts'

/** Tokens by kind. */
export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }
/**
 * Tokens per second over the last 30 seconds at most, measured over `elapsed` seconds, and the totals since the server
 * opened with their cost in dollars.
 */
export type RateSample = { rates: Tokens; elapsed: number; totals: Tokens & { cost: number } }

/** No arguments → the latest rate sample, or null until two samples within 5 seconds of each other exist. */
export const RatesAction = actionRef<null, RateSample | null>('status-line', 'rates')

/** Recorded counters; null means at least one contributing bucket has no counter, or no usage was recorded. */
export type UsageFigures = {
  input: number | null
  output: number | null
  cacheRead: number | null
  cacheWrite: number | null
  cacheWrite1h: number | null
  reasoning: number | null
  cost: number | null
}
/** One conversation's own recorded usage, with its existing role label and reported model/tool buckets. */
export type ConversationUsage = {
  id: number
  owner?: number
  label?: string
  title?: string
  totals: UsageFigures
  models: Record<string, UsageFigures>
  tools: Record<string, UsageFigures>
}
/** On-demand usage for a conversation and its owned descendants, counted once each. */
export type SubtreeUsage = {
  conversation: number
  observedAt: string
  totals: UsageFigures
  models: Record<string, UsageFigures>
  tools: Record<string, UsageFigures>
  conversations: ConversationUsage[]
  coverage: string[]
}
/**
 * `{ conversation? }` (defaults to the caller) → recorded own usage summed over that conversation and its owned
 * descendants. Fork history alone is not ownership. Reads native durable counters; does not create a ledger.
 */
export const UsageAction = actionRef<{ conversation?: number }, SubtreeUsage>(
  'status-line',
  'usage',
)
