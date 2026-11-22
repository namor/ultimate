import { GitForkIcon } from 'lucide-react'
import { Card, ROOT, api, defineWebExtension, renderEntry, useConversation, useDocOf } from '@/sdk'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PreferencesDoc, Result, RunMode, SetAutomatic } from './refs.ts'
import type { Mode } from './refs.ts'

const modes = ['plan', 'review'] as const
const modeTitle = (mode: Mode) => (mode === 'plan' ? 'Plan' : 'Review')

function Controls() {
  const { id } = useConversation()
  const preferences = useDocOf(ROOT, PreferencesDoc)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Plan and Review"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <GitForkIcon className="size-3.5" />
          <span className="@max-md:hidden">Plan & Review</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3" side="top" align="start">
        <div className="section-label">Coordinator checkpoints</div>
        {modes.map((mode) => {
          const title = modeTitle(mode)
          return (
            <div className="flex items-center justify-between gap-2 text-xs" key={mode}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences?.[mode] ?? true}
                  onChange={(event) =>
                    api.action(SetAutomatic, { mode, enabled: event.currentTarget.checked })
                  }
                />
                Automatic {title}
              </label>
              <button
                type="button"
                className="rounded px-2 py-1 hover:bg-accent"
                onClick={() => api.action(RunMode, { mode }, { conversationId: id })}
              >
                Run {title}
              </button>
            </div>
          )
        })}
        <p className="text-xs text-muted-foreground">
          Read-only advice. Set the shared model in Model families.
        </p>
      </PopoverContent>
    </Popover>
  )
}

const ResultCard = renderEntry(Result, function ResultCard({ entry }) {
  const data = entry.data
  return (
    <Card data-coordinator-mode={data.mode}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
        <GitForkIcon className="size-3.5 text-brand" />
        <span className="text-foreground">{modeTitle(data.mode)}</span>
        <span>advisory · {data.status}</span>
        {data.revision && <span title={data.revision}>{data.revision.slice(0, 10)}</span>}
      </header>
      <div className="break-words px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
        {data.text}
      </div>
      <div className="flex flex-wrap gap-x-2 border-t border-border/60 px-3 py-2 font-mono text-[10.5px] text-muted-foreground">
        <span>{data.model}</span>
        <span>{data.effort} requested</span>
        <span>{data.bytes.toLocaleString()} B packet</span>
        <span>{data.contextWindow.toLocaleString()} token window</span>
        {data.usage && (
          <span>
            {data.usage.input.toLocaleString()} input · {data.usage.output.toLocaleString()} output
            · ${data.usage.cost.toFixed(4)} reported
          </span>
        )}
        <span>No hard output cap</span>
      </div>
    </Card>
  )
})

export default defineWebExtension({
  slots: { 'composer.toolbar': [Controls] },
  entries: { [Result.kind]: ResultCard },
})
