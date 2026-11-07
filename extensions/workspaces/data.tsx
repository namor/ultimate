import { useConversations, useDocOf } from '@/sdk'
import type { ConversationSummary } from '@/sdk'
import { WorkspacesDoc } from './refs.ts'
import type { Workspace, WorkspaceIndex } from './types.ts'

export type WorkspaceConversation = ConversationSummary & { workspace?: Workspace }
const none: WorkspaceIndex = {
  items: {},
  queue: [],
  landers: {},
  landerConversations: {},
  results: {},
}
export function useWorkspaces() {
  return useWorkspaceIndex().items
}
/** The whole root index: queue, lander conversations and recent outcomes. */
export function useWorkspaceIndex() {
  return useDocOf(1, WorkspacesDoc) ?? none
}
/** Submissions waiting for or being processed by a lander, oldest first. */
export function useLanderQueue() {
  return useWorkspaceIndex().queue
}
export function useWorkspaceConversations(): WorkspaceConversation[] {
  const records = useWorkspaces()
  return useConversations().map((conversation) => ({
    ...conversation,
    workspace: records[String(conversation.id)],
  }))
}

/** The checkout behind a lander's log, named relative to the project rather than its detached worktree. */
export function landerSource(index: WorkspaceIndex, id: number, projectRoot?: string) {
  const source = Object.entries(index.landerConversations).find(([, lander]) => lander === id)?.[0]
  if (!source) return undefined
  return {
    path: source,
    label:
      source === projectRoot
        ? 'Project checkout'
        : source.split('/').filter(Boolean).at(-1) || source,
  }
}

export const stateLabel = (workspace: Workspace) =>
  ({ preparing: 'Setting up…', ready: 'Ready', failed: 'Setup failed', removed: 'Removed' })[
    workspace.state
  ]
