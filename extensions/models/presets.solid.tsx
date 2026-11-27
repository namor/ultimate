import { Check, Layers, Plus, Trash2, TriangleAlert } from '@lucide/solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.solid.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog.solid.tsx'
import { Kbd } from '@/components/ui/kbd.solid.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.solid.tsx'
import {
  api,
  cn,
  errorMessage,
  keepLast,
  openPanel,
  useAction,
  useConversationId,
  useDialog,
  writingAs,
} from '@/sdk/solid'
import { DEFAULT_FAMILY, familyTitle } from '../../lib/families.ts'
import { refreshFamilies } from './families.solid.tsx'
import { ApplyPresetAction, DeletePresetAction, PresetsAction, SavePresetAction } from './refs.ts'
import type { PresetView } from './refs.ts'
import { dialogs, openLogin, termsOf } from './state.ts'

const short = (ref: string) => ref.slice(ref.indexOf('/') + 1).replace(/:[a-z]+$/, '')

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

function presetDetails({ preset, orphans }: PresetView) {
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

function PresetList(props: { close: () => void }) {
  const conversationId = useConversationId()
  const [, setLogin] = useDialog(dialogs.login)
  const [, setPicker] = useDialog(dialogs.picker)
  const { data, error: loadError, refetch } = useAction(PresetsAction, null, { onError: keepLast })
  const [query, setQuery] = createSignal('')
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal<string>()
  const [deleting, setDeleting] = createSignal<string>()
  const presets = () => data()?.presets ?? []
  const name = () => query().trim()
  const shown = createMemo(() => {
    const terms = termsOf(name())
    return presets().filter((preset) =>
      terms.every((term) => `${preset.name} ${summary(preset)}`.toLowerCase().includes(term)),
    )
  })
  const existing = () => presets().some((preset) => preset.name === name())
  let writing = false

  async function run(label: string, write: () => Promise<unknown>, after?: () => void) {
    if (writing) return
    writing = true
    setPending(label)
    setError(undefined)
    try {
      await write()
      await Promise.all([refetch(), refreshFamilies()])
      after?.()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      writing = false
      setPending(undefined)
    }
  }

  function choose(value: string, source: string) {
    if (writing) return
    if (value === 'save') {
      const target = name()
      return run(
        `save ${target}`,
        () => api.action(SavePresetAction, { name: target }),
        () => setQuery(''),
      )
    }
    const preset = presets().find((item) => value === `preset/${item.name}`)
    if (!preset) return
    const close = props.close
    const [missing] = preset.missing
    if (missing) {
      close()
      if (missing.provider === 'claude-code') openPanel('claude-code')
      else
        openLogin(
          {
            conversationId: conversationId(),
            open: () => setLogin(true),
            close: () => setPicker(false),
          },
          missing.provider,
        )
      return
    }
    if (preset.current) return close()
    return run(
      preset.name,
      () => api.action(ApplyPresetAction, { name: preset.name }),
      () => writingAs(source, close),
    )
  }

  return (
    <Command
      class="[&_[data-slot=command-group-label]]:px-2 [&_[data-slot=command-group-label]]:pt-2 [&_[data-slot=command-group-label]]:pb-1 [&_[data-slot=command-group-label]]:section-label"
      filter={false}
      onAction={(value, details) => choose(value, details.source)}
      onQueryChange={(next) => {
        setQuery(next)
        setError(undefined)
        setDeleting(undefined)
      }}
      query={query()}
    >
      <CommandInput
        aria-label="Search or name a preset"
        class="text-[13px]"
        maxlength={40}
        disabled={!!loadError()}
        placeholder={presets().length ? 'Search presets, or type a new name…' : 'Name a preset…'}
      />
      <CommandList class="max-h-[50vh]">
        <Show
          when={loadError()}
          fallback={
            !data() && <p class="px-3 py-4 text-[12px] text-muted-foreground">Loading presets…</p>
          }
        >
          {(failure) => (
            <p class="px-3 py-4 font-mono text-[11.5px] leading-snug break-words text-error">
              {errorMessage(failure())}
            </p>
          )}
        </Show>
        <Show when={data() && !presets().length && !name()}>
          <CommandEmpty class="px-4 py-5 text-center text-[12px] leading-relaxed text-muted-foreground">
            No presets yet. Type a name to save the families and feature pins that apply now, then
            switch back to them here.
          </CommandEmpty>
        </Show>
        <Show when={shown().length}>
          <CommandGroup heading="Presets">
            <For each={shown()} keyed={(preset) => preset.name}>
              {(preset) => (
                <CommandItem
                  class="group/preset gap-2 py-1.5 font-mono text-[12px]"
                  title={presetDetails(preset())}
                  value={`preset/${preset().name}`}
                >
                  <Check
                    aria-hidden="true"
                    class={cn(
                      'mt-0.5 size-3.5 self-start',
                      preset().current ? 'text-brand' : 'opacity-0',
                    )}
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-center gap-2">
                      <span
                        class={cn(
                          'min-w-0 truncate font-sans text-[12.5px]',
                          preset().current ? 'text-brand' : 'text-foreground',
                        )}
                      >
                        {preset().name}
                      </span>
                      <Show when={pending() === preset().name}>
                        <span class="shrink-0 text-[10.5px] text-muted-foreground">switching…</span>
                      </Show>
                    </div>
                    <div class="truncate text-[10.5px] text-muted-foreground">
                      <Show
                        when={preset().missing.length}
                        fallback={
                          <>
                            {summary(preset()) || "Pi's default"}
                            <Show when={preset().orphans.length}>
                              <span class="text-warning">
                                {' '}
                                ·{' '}
                                {preset()
                                  .orphans.map((item) => item.agent)
                                  .join(', ')}{' '}
                                → Ultimate
                              </span>
                            </Show>
                          </>
                        }
                      >
                        <span class="text-warning">
                          <TriangleAlert class="mr-1 inline size-3 align-[-2px] text-warning" />
                          needs{' '}
                          {preset()
                            .missing.map((item) => item.name)
                            .join(' and ')}{' '}
                          login · Enter to log in
                        </span>
                      </Show>
                    </div>
                  </div>
                  <Button
                    aria-label={
                      deleting() === preset().name
                        ? `Confirm delete ${preset().name}`
                        : `Delete ${preset().name}`
                    }
                    class={cn(
                      'flex h-5 shrink-0 items-center gap-1 self-start rounded px-1 text-[10.5px] text-muted-foreground/0 transition-colors group-hover/preset:text-muted-foreground group-data-highlighted/preset:text-muted-foreground hover:bg-background hover:text-error focus-visible:text-error pointer-coarse:text-muted-foreground',
                      deleting() === preset().name && 'text-error group-hover/preset:text-error',
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (writing) return undefined
                      const target = preset().name
                      if (deleting() !== target) {
                        setDeleting(target)
                        return undefined
                      }
                      setDeleting(undefined)
                      return run(`delete ${target}`, () =>
                        api.action(DeletePresetAction, { name: target }),
                      )
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    size={null}
                    title={
                      deleting() === preset().name ? 'Click again to delete' : 'Delete this preset'
                    }
                    variant={null}
                  >
                    <Show when={deleting() === preset().name}>delete?</Show>
                    <Trash2 class="size-3" />
                  </Button>
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </Show>
        <Show when={data() && name()}>
          <CommandGroup heading="Save">
            <CommandItem class="gap-2 py-1.5 font-mono text-[12px]" value="save">
              <Plus class="size-3.5" />
              <span class="min-w-0 truncate font-sans text-[12.5px]">
                {existing() ? 'Replace' : 'Save current as'}{' '}
                <span class="text-foreground">“{name()}”</span>
              </span>
              <span class="ml-auto shrink-0 pl-3 text-[10.5px] text-muted-foreground max-sm:hidden">
                families and feature pins that apply now
              </span>
            </CommandItem>
          </CommandGroup>
        </Show>
      </CommandList>
      <div class="flex min-h-7 items-center gap-3 border-t border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground">
        <Show
          when={error()}
          fallback={
            <>
              <span class="shrink-0 whitespace-nowrap max-sm:hidden">
                <Kbd>↵</Kbd> switch
              </span>
              <span class="min-w-0">Applies to new conversations; open ones keep their model.</span>
            </>
          }
        >
          {(message) => (
            <span class="min-w-0 break-words text-error" role="alert">
              {message()}
            </span>
          )}
        </Show>
      </div>
    </Command>
  )
}

export function PresetsDialog() {
  const [open, setOpen] = useDialog(dialogs.presets)
  return (
    <Dialog onOpenChange={setOpen} open={open()}>
      <DialogContent
        class="top-[16%] translate-y-0 grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0 font-mono sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle class="sr-only">Switch model preset</DialogTitle>
        <DialogDescription class="sr-only">
          Switch the model families and feature pins new conversations use, or save the current ones
          as a preset.
        </DialogDescription>
        <Show when={open()}>
          <PresetList close={() => setOpen(false)} />
        </Show>
      </DialogContent>
    </Dialog>
  )
}

export function PresetsButton() {
  const [open, setOpen] = createSignal(false)
  return (
    <Popover onOpenChange={setOpen} open={open()}>
      <PopoverTrigger
        class="inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground data-open:bg-accent data-open:text-foreground"
        title="Switch or save model presets"
      >
        <Layers class="size-3" /> Presets
      </PopoverTrigger>
      <PopoverContent align="end" class="w-[min(30rem,calc(100vw-1.5rem))] p-0 font-mono">
        <Show when={open()}>
          <PresetList close={() => setOpen(false)} />
        </Show>
      </PopoverContent>
    </Popover>
  )
}
