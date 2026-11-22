/** Coordinator Plan and Review switches, manual requests and result cards. */
import { defineEntry } from '@earendil-works/pi-durable'
import { actionRef, docRef } from '../../shared/extension-api.ts'

export type Mode = 'plan' | 'review'
export type Preferences = Partial<Record<Mode, boolean>>
/** Project-wide automatic switches, each on unless explicitly disabled. */
export const PreferencesDoc = docRef<Preferences>('coordinator-modes.preferences')
/** Set one automatic switch. User-only. */
export const SetAutomatic = actionRef<{ mode: Mode; enabled: boolean }, null>(
  'coordinator-modes',
  'setAutomatic',
)
/** Request a checkpoint in this coordinator branch even if automatic mode is off. User-only. */
export const RunMode = actionRef<{ mode: Mode }, { started: boolean }>('coordinator-modes', 'run')
/** One machine-authored advisory result and its request and usage metadata. */
export const Result = defineEntry<ModeResult>('coordinator-modes.result')
export type ModeResult = {
  mode: Mode
  family: string
  model: string
  effort: string
  bytes: number
  contextWindow: number
  base?: string
  revision?: string
  truncated?: true
  status: 'ready' | 'partial' | 'stale' | 'failed'
  text: string
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }
}
