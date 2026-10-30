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
}

export type CursorRequest = {
  directory: string
  source: string
  task: string
}
