import type { ReactNode } from 'react'
import { ChevronRightIcon, GitMergeIcon } from 'lucide-react'
import { MentionText } from '@/components/ai/message'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { defineWebExtension, useConversation, useSystem, useTranscript } from '@/sdk'
import { landerSource, useWorkspaceIndex } from './data.tsx'
import { CommitCount, LandingCard, useGithubRepo } from './landing.tsx'
import { LanderLogEntry, LanderReport, WorkspaceCall } from './log.tsx'
import { compareUrl } from '../../lib/compare.ts'
import type { EntryRecord } from '@earendil-works/pi-durable'

/** The lander's note in the root: the landing's card, from the note's own data, with the state it froze. */
function LandingNote({ entry }: { entry: EntryRecord }) {
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
  } = entry.data as {
    from: number
    at?: number
    divergence?: string
    sha: string
    base?: string
    target: string
    title?: string
    summary?: string
    feature?: string
    commits: { sha: string; subject: string }[]
    paths: string[]
    more: number
    pushed?: string
    abstract?: { at: number; text: string }
  }
  const github = useGithubRepo()
  // A note from before landings recorded their base: the landing before it, where the lander's serial queue left the
  // target.
  const transcript = useTranscript()
  const previous = base
    ? undefined
    : (
        transcript.findLast(
          (other) =>
            other.kind === 'lineage.note' &&
            other.id < entry.id &&
            (other.data as { source?: string })?.source === 'lander',
        )?.data as { sha?: string } | undefined
      )?.sha
  const rangeBase = base ?? previous
  return (
    <div data-lineage-note="lander">
      <LandingCard
        card={entry.id}
        sha={sha}
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

/** The lander's conversation is its log: in place of a composer, a line saying what it is. */
function LanderComposer({ core, dock }: { core: ReactNode; dock?: boolean }) {
  const id = useConversation((conversation) => conversation.id)
  const index = useWorkspaceIndex()
  const source = landerSource(index, id ?? -1, useSystem()?.project.root)
  if (!source) return core
  const queue = index.queue.filter((item) => item.source === source.path)
  const landing = queue.some((item) => item.state === 'landing')
  const queued = queue.filter((item) => item.state === 'queued').length
  return (
    <div className={`${dock ? 'w-full px-4' : 'mx-auto w-full max-w-[46rem] px-3 sm:px-6'} pb-3`}>
      <div
        className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-3.5 py-2.5 text-[12.5px] text-muted-foreground"
        data-lander-log={id}
      >
        <GitMergeIcon className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0 font-medium break-words text-foreground">{source.label}</span>
            <span className={landing ? 'text-brand' : undefined}>
              {landing ? 'Landing' : 'Idle'}
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

export default defineWebExtension({
  composer: LanderComposer,
  tools: { workspace: WorkspaceCall },
  entries: {
    'lineage.note': ({ entry, core }) =>
      (entry.data as { source?: string })?.source === 'lander' ? (
        <LandingNote entry={entry} />
      ) : (
        core
      ),
    'ultimate.lander': LanderLogEntry,
    'workspaces.lander-report': LanderReport,
  },
})
