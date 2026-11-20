import type { ConversationId, EntryId } from '@earendil-works/pi-durable'
import type { ReactNode } from 'react'
import { ChevronRightIcon, GitMergeIcon } from 'lucide-react'
import { MentionText } from '@/components/ai/message'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ConversationEmptyState } from '@/components/ai/conversation'
import {
  cn,
  column,
  defineWebExtension,
  EmptyTranscript,
  provide,
  useConversation,
  useSystem,
  useTranscript,
} from '@/sdk'
import { landerSource, useWorkspaceIndex } from './data.tsx'
import { CommitCount, LandingCard, useGithubRepo } from './landing.tsx'
import { LanderLogEntry, LanderReport, WorkspaceCall } from './log.tsx'
import { compareUrl } from '../../lib/compare.ts'
import { NoteEntry } from '../entries/ui.tsx'
import type { NoteData } from '../entries/refs.ts'

function LandingNote({ id, data }: { id: EntryId; data: Extract<NoteData, { source: 'lander' }> }) {
  const {
    from,
    at,
    divergence,
    sha,
    base,
    target,
    title,
    summary,
    feature,
    commits,
    paths,
    more,
    pushed,
    abstract,
    submission,
  } = data
  const github = useGithubRepo()
  const transcript = useTranscript()
  const previousLandingForLegacyBase = base
    ? undefined
    : transcript.findLast(
        (other) => NoteEntry.is(other) && other.id < id && other.data.source === 'lander',
      )
  const rangeBase =
    base ??
    (NoteEntry.is(previousLandingForLegacyBase) &&
    previousLandingForLegacyBase.data.source === 'lander'
      ? previousLandingForLegacyBase.data.sha
      : undefined)
  return (
    <div data-lineage-note="lander">
      <LandingCard
        card={id}
        sha={sha}
        submission={submission}
        from={from}
        sourceEntry={at}
        divergence={divergence}
        headline={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>
              Landed {sha.slice(0, 7)} on {target}
              {pushed ? ` · pushed to ${pushed}` : ''}
            </span>
            <CommitCount
              className="text-muted-foreground"
              count={commits.length + more}
              href={github && rangeBase ? compareUrl(github, rangeBase, sha) : undefined}
              range={rangeBase ? `${rangeBase}...${sha}` : undefined}
            />
          </span>
        }
        subject={{
          ...(title ? { title } : {}),
          ...(summary ? { summary } : {}),
          ...(feature ? { feature } : {}),
        }}
        tone="landed"
      >
        {paths.length > 0 && (
          <p className="break-words text-muted-foreground">Changed: {paths.join(', ')}</p>
        )}
        {abstract && (
          <Collapsible className="group/state">
            <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]/state:rotate-90" />
              State at landing
              <span className="text-muted-foreground/70">
                · #{from}/{abstract.at}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1 pl-4 font-sans text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
              <MentionText text={abstract.text} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </LandingCard>
    </div>
  )
}

function LanderComposer({ core, dock }: { core: ReactNode; dock?: boolean }) {
  const id = useConversation((conversation) => conversation.id)
  const index = useWorkspaceIndex()
  const source = landerSource(index, id ?? -1, useSystem()?.project.root)
  if (!source) return core
  const queue = index.queue.filter((item) => item.source === source.path)
  const landing = queue.some((item) => item.state === 'landing')
  const queued = queue.filter((item) => item.state === 'queued').length
  const waiting = queue.some((item) => item.state === 'waiting')
  return (
    <div className={cn(column(dock), 'pb-3')}>
      <div
        className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-3.5 py-2.5 text-[12.5px] text-muted-foreground"
        data-lander-log={id}
      >
        <GitMergeIcon className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0 font-medium break-words text-foreground">{source.label}</span>
            <span className={landing ? 'text-brand' : undefined}>
              {landing ? 'Landing' : waiting ? 'Waiting on delivery' : 'Idle'}
              {queued > 0 ? ` · ${queued} queued` : ''}
            </span>
          </div>
          <p className="font-mono text-[11px] break-all select-text">{source.path}</p>
          <p>
            One landing log per source checkout. The lander runs code, not a model; outcomes go back
            to each submitting branch.
          </p>
        </div>
      </div>
    </div>
  )
}

function useEmptyLander({ conversation, core }: { conversation: ConversationId; core: ReactNode }) {
  const source = landerSource(useWorkspaceIndex(), conversation, useSystem()?.project.root)
  if (!source) return core
  return (
    <ConversationEmptyState className="min-h-[55vh]">
      <GitMergeIcon className="mb-3 size-5 text-brand" />
      <h2 className="text-[14px] font-medium text-foreground">No landings yet</h2>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
        Submissions for this checkout will appear here with their checks and outcomes.
      </p>
    </ConversationEmptyState>
  )
}

export default defineWebExtension({
  provides: [provide(EmptyTranscript, useEmptyLander)],
  composer: LanderComposer,
  tools: { workspace: WorkspaceCall },
  entries: {
    'lineage.note': ({ entry, core }) =>
      NoteEntry.is(entry) && entry.data.source === 'lander' ? (
        <LandingNote id={entry.id} data={entry.data} />
      ) : (
        core
      ),
    'ultimate.lander': LanderLogEntry,
    'workspaces.lander-report': LanderReport,
  },
})
