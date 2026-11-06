export type LocationScope = {
  form:
    | 'absolute'
    | 'relative'
    | 'file_uri'
    | 'uri'
    | 'tilde'
    | 'empty'
    | 'missing'
    | 'non_string'
    | 'control'
    | 'too_long'
  lexicalInside: boolean | null
  canonicalInside: boolean | null
  root:
    | 'assigned'
    | 'source'
    | 'repository'
    | 'git_common'
    | 'job_data'
    | 'temporary'
    | 'system'
    | 'other'
}
export type LocationDiagnostic = LocationScope & {
  phase: 'progress' | 'permission'
  field: 'locations' | 'input'
  kind: string
  status: string
  permission: 'none' | 'allowed_once' | 'rejected'
}
export type ProcessIdentity = { pid: number; ppid: number; pgid: number; birth: string }
export type ProcessEvidence = {
  root?: ProcessIdentity
  lastObserved?: { at: number; owned: ProcessIdentity[] }
  remaining?: { at: number; owned: ProcessIdentity[] }
  observedCount: number
  reaped: boolean
  trackingFailed: boolean
  failure?: {
    at: number
    phase: 'sampling' | 'cleanup'
    category:
      | 'timeout'
      | 'buffer_limit'
      | 'execution'
      | 'malformed_row'
      | 'invalid_birth'
      | 'capacity'
      | 'signal'
  }
}
export type CursorJob = {
  id: string
  task: string
  status: 'starting' | 'running' | 'complete' | 'interrupted' | 'failed'
  source: string
  worktree: string
  base: string
  model: string
  startedAt: number
  endedAt?: number
  sessionId?: string
  activity: string
  nativeCalls: number
  resultPath: string
  patchPath: string
  summary: string
  diffStat: string
  error?: string
  locationDiagnostics?: LocationDiagnostic[]
  locationDiagnosticsDropped?: number
  processEvidence?: ProcessEvidence
}

export type CursorRequest = {
  directory: string
  source: string
  task: string
}
