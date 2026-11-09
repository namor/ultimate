/**
 * Switching model presets: one searchable list, in the Agents panel's Presets popover and the ⌘K dialog. Enter applies
 * a preset (new conversations use it, open ones keep their model); a preset lacking a login opens that login instead.
 * Typing a new name offers to save what applies now under it; a row's trash deletes it after a second click.
 */
import { CheckIcon, LayersIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api, cn, errorMessage, useAction, useDialog, useUltimate } from '@/sdk'
import { DEFAULT_FAMILY, familyTitle } from '../../lib/families.ts'
import { refreshFamilies } from './families.tsx'
import { ApplyPresetAction, DeletePresetAction, PresetsAction, SavePresetAction } from './refs.ts'
import type { PresetView } from './refs.ts'
import { dialogs, openLogin } from './state.tsx'

const short = (ref: string) => ref.slice(ref.indexOf('/') + 1).replace(/:[a-z]+$/, '')

/** "claude-sonnet-5-5 · claude-opus-5-5 +1": the default family's model first, then the others by use. */
function summary({ preset }: PresetView) {
  const counts = new Map<string, number>()
  const main = preset.families[DEFAULT_FAMILY]?.model
  for (const family of Object.values(preset.families))
    if (family.model) counts.set(short(family.model), (counts.get(short(family.model)) ?? 0) + 1)
  const models = [...counts]
    .toSorted(
      ([a, x], [b, y]) =>
        Number(b === short(main ?? '')) - Number(a === short(main ?? '')) || y - x,
    )
    .map(([model]) => model)
  return models.length > 2
    ? `${models.slice(0, 2).join(' · ')} +${models.length - 2}`
    : models.join(' · ')
}

const providers = ({ preset }: PresetView) =>
  [
    ...new Set(
      [
        ...Object.values(preset.families).map((family) => family.model),
        ...Object.values(preset.pins),
      ]
        .filter((model): model is string => !!model)
        .map((model) => model.slice(0, model.indexOf('/'))),
    ),
  ].join(', ')

/** Every family and pin of a preset, one per line, for a row's tooltip. */
function details({ preset, orphans }: PresetView) {
  const lines = Object.entries(preset.families).map(
    ([name, family]) =>
      `${familyTitle(name)}: ${family.model ?? "Pi's default"}${family.thinking ? ` · ${family.thinking}` : ''}`,
  )
  for (const [feature, pin] of Object.entries(preset.pins))
    lines.push(`${feature === 'summaries' ? 'Summaries' : 'Previews'} pinned: ${pin ?? 'off'}`)
  for (const { agent, family } of orphans)
    lines.push(`${agent} names ${familyTitle(family)}, not in it: runs on Ultimate`)
  return lines.join('\n')
}

function PresetList({ close }: { close: () => void }) {
  const actions = useUltimate()
  const { data, error: loadError, refetch } = useAction(PresetsAction, null, { onError: () => {} })
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState<string>()
  const [deleting, setDeleting] = useState<string>()
  const presets = data?.presets ?? []
  const name = query.trim()
  const terms = name.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = presets.filter((preset) =>
    terms.every((term) => `${preset.name} ${summary(preset)}`.toLowerCase().includes(term)),
  )
  const existing = presets.find((preset) => preset.name === name)

  /** Run an action, then refresh the list and the families; a failure shows in the footer. */
  function run(label: string, action: () => Promise<unknown>, after?: () => void) {
    setPending(label)
    setError(undefined)
    action()
      .then(() => Promise.all([refetch(), refreshFamilies()]))
      .then(
        () => after?.(),
        (failure: unknown) => setError(errorMessage(failure)),
      )
      .finally(() => setPending(undefined))
  }
  function choose(preset: PresetView) {
    if (pending) return
    const [missing] = preset.missing
    if (missing) {
      close()
      // Claude runs on its subscription only through Claude Code, set up in its own panel.
      if (missing.provider === 'claude-code') actions.openPanel('claude-code')
      else openLogin(actions, missing.provider)
      return
    }
    if (preset.current) return close()
    run(preset.name, () => api.action(ApplyPresetAction, { name: preset.name }), close)
  }

  return (
    <Command
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:section-label"
      shouldFilter={false}
    >
      <CommandInput
        aria-label="Search or name a preset"
        className="text-[13px]"
        maxLength={40}
        onValueChange={(next) => {
          setQuery(next)
          setError(undefined)
          setDeleting(undefined)
        }}
        placeholder={presets.length ? 'Search presets, or type a new name…' : 'Name a preset…'}
        value={query}
      />
      <CommandList className="max-h-[50vh]">
        {loadError ? (
          <p className="px-3 py-4 font-mono text-[11.5px] leading-snug break-words text-error">
            {errorMessage(loadError)}
          </p>
        ) : (
          !data && <p className="px-3 py-4 text-[12px] text-muted-foreground">Loading presets…</p>
        )}
        {data && !presets.length && !name && (
          <CommandEmpty className="px-4 py-5 text-center text-[12px] leading-relaxed text-muted-foreground">
            No presets yet. Type a name to save the families and summary model that apply now, then
            switch back to them here.
          </CommandEmpty>
        )}
        {shown.length > 0 && (
          <CommandGroup heading="Presets">
            {shown.map((preset) => (
              <CommandItem
                className="group/preset gap-2 py-1.5 font-mono text-[12px]"
                key={preset.name}
                onSelect={() => choose(preset)}
                title={details(preset)}
                value={`preset/${preset.name}`}
              >
                <CheckIcon
                  className={cn(
                    'size-3.5 self-start mt-0.5',
                    preset.current ? 'text-brand' : 'opacity-0',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'min-w-0 truncate font-sans text-[12.5px]',
                        preset.current ? 'text-brand' : 'text-foreground',
                      )}
                    >
                      {preset.name}
                    </span>
                    {pending === preset.name && (
                      <span className="shrink-0 text-[10.5px] text-muted-foreground">
                        switching…
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[10.5px] text-muted-foreground">
                    {preset.missing.length ? (
                      <span className="text-warning">
                        <TriangleAlertIcon className="mr-1 inline size-3 align-[-2px] text-warning" />
                        needs {preset.missing.map((item) => item.name).join(' and ')} login · Enter
                        to log in
                      </span>
                    ) : (
                      <>
                        {summary(preset) || "Pi's default"}
                        {preset.orphans.length > 0 && (
                          <span className="text-warning">
                            {' '}
                            · {preset.orphans.map((item) => item.agent).join(', ')} → Ultimate
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <span className="shrink-0 self-start pt-0.5 text-[10.5px] text-muted-foreground/70 max-sm:hidden">
                  {providers(preset)}
                </span>
                <button
                  aria-label={
                    deleting === preset.name
                      ? `Confirm delete ${preset.name}`
                      : `Delete ${preset.name}`
                  }
                  className={cn(
                    'flex h-5 shrink-0 items-center gap-1 self-start rounded px-1 text-[10.5px] text-muted-foreground/0 transition-colors group-hover/preset:text-muted-foreground group-data-[selected=true]/preset:text-muted-foreground hover:bg-background hover:text-error focus-visible:text-error pointer-coarse:text-muted-foreground',
                    deleting === preset.name && 'text-error group-hover/preset:text-error',
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (deleting !== preset.name) return setDeleting(preset.name)
                    setDeleting(undefined)
                    run(`delete ${preset.name}`, () =>
                      api.action(DeletePresetAction, { name: preset.name }),
                    )
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  title={deleting === preset.name ? 'Click again to delete' : 'Delete this preset'}
                  type="button"
                >
                  {deleting === preset.name && 'delete?'}
                  <Trash2Icon className="size-3" />
                </button>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {data && name && (
          <CommandGroup heading="Save">
            <CommandItem
              className="gap-2 py-1.5 font-mono text-[12px]"
              onSelect={() => {
                if (pending) return
                run(
                  `save ${name}`,
                  () => api.action(SavePresetAction, { name }),
                  () => setQuery(''),
                )
              }}
              value="save"
            >
              <PlusIcon className="size-3.5" />
              <span className="min-w-0 truncate font-sans text-[12.5px]">
                {existing ? 'Replace' : 'Save current as'}{' '}
                <span className="text-foreground">“{name}”</span>
              </span>
              <span className="ml-auto shrink-0 pl-3 text-[10.5px] text-muted-foreground max-sm:hidden">
                families and summary model that apply now
              </span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
      <div className="flex min-h-7 items-center gap-3 border-t border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground">
        {error ? (
          <span className="min-w-0 break-words text-error" role="alert">
            {error}
          </span>
        ) : (
          <>
            <span className="max-sm:hidden">
              <Kbd>↵</Kbd> switch
            </span>
            <span className="min-w-0">
              Applies to new conversations; open ones keep their model.
            </span>
          </>
        )}
      </div>
    </Command>
  )
}

/** ⌘K "Switch model preset…": the list in a dialog. */
export function PresetsDialog() {
  const [open, setOpen] = useDialog(dialogs.presets)
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent
        className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 font-mono sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Switch model preset</DialogTitle>
        <DialogDescription className="sr-only">
          Switch the model families and summary model new conversations use, or save the current
          ones as a preset.
        </DialogDescription>
        {open && <PresetList close={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** The Agents panel's "Presets" button: the list in a popover. */
export function PresetsButton() {
  const [open, setOpen] = useState(false)
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="h-5 gap-1 px-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
          size="xs"
          title="Switch or save model presets"
          variant="ghost"
        >
          <LayersIcon className="size-3" />
          Presets
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(30rem,calc(100vw-1.5rem))] p-0 font-mono">
        {open && <PresetList close={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  )
}
