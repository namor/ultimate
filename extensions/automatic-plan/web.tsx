import { useState } from 'react'
import { GitForkIcon } from 'lucide-react'
import { api, Card, defineWebExtension, errorMessage, renderEntry, useDocOf } from '@/sdk'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PlanCard, Refine, RevisionCard, SendRevision, ThreadDoc } from './refs.ts'
import type { ConversationId } from '@earendil-works/pi-durable'

function PlanningThread({ fork }: { fork: ConversationId }) {
  const thread = useDocOf(fork, ThreadDoc)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const length = thread?.turns.length ?? 0
  const latest = thread?.turns.at(-1)
  const pending = latest && !latest.answer && !latest.error
  async function act(send: boolean) {
    setBusy(true)
    setError(undefined)
    try {
      if (send) await api.action(SendRevision, { fork, revision: length - 1 })
      else {
        await api.action(Refine, { fork, after: length, text: prompt })
        setPrompt('')
      }
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="ml-auto cursor-pointer text-brand hover:underline">
          Continue planning
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
        <DialogTitle>Planning thread #{fork}</DialogTitle>
        <DialogDescription>
          Follow-up stays here until you send a revision. This thread has no tools or coordinator
          permissions.
        </DialogDescription>
        <div className="text-muted-foreground font-mono text-[11px]">
          {thread?.model} {thread?.effort && `· ${thread.effort} requested`}
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto">
          {thread?.turns.map((turn, index) => (
            <div
              key={index}
              className="rounded-md border border-border/60 p-3 text-sm whitespace-pre-wrap break-words"
            >
              {turn.prompt && <p className="mb-2 text-muted-foreground">{turn.prompt}</p>}
              <p>{turn.answer ?? turn.error ?? 'Planning…'}</p>
            </div>
          ))}
        </div>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void act(false)
          }}
        >
          <textarea
            aria-label="Refine plan"
            rows={2}
            maxLength={3000}
            className="w-full rounded border border-border bg-background p-2 text-sm"
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="submit"
              disabled={busy || pending || !prompt.trim() || !thread?.turns[0]?.answer}
              className="rounded border border-border px-2 py-1 disabled:opacity-50"
            >
              Ask in planning thread
            </button>
            {length > 1 && latest?.answer && (
              <button
                type="button"
                onClick={() => void act(true)}
                disabled={busy || thread?.sent === length - 1 || thread?.sending !== undefined}
                className="rounded border border-border px-2 py-1 disabled:opacity-50"
              >
                {thread?.sent === length - 1 ? 'Revision sent' : 'Send revised plan'}
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CardBody({
  fork,
  text,
  revision,
}: {
  fork: ConversationId
  text: string
  revision?: number
}) {
  return (
    <Card data-automatic-plan={fork}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 font-mono text-[11px]">
        <GitForkIcon className="size-3.5 text-brand" />
        <span>{revision === undefined ? 'Plan' : `Revised plan · ${revision}`}</span>
        <PlanningThread fork={fork} />
      </header>
      <p className="px-3 py-2 text-sm whitespace-pre-wrap break-words">{text}</p>
    </Card>
  )
}

export default defineWebExtension({
  entries: {
    [PlanCard.kind]: renderEntry(PlanCard, ({ entry }) => <CardBody {...entry.data} />),
    [RevisionCard.kind]: renderEntry(RevisionCard, ({ entry }) => <CardBody {...entry.data} />),
  },
})
