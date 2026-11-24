import { GitFork } from '@lucide/solid'
import type { ConversationId } from '@earendil-works/pi-durable'
import { For, Show, createEffect, createMemo, createSignal, createStore, onCleanup } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.solid.tsx'
import { Form } from '@/components/ui/form.solid.tsx'
import { Textarea } from '@/components/ui/input.solid.tsx'
import {
  api,
  Card,
  defineWebExtension,
  errorMessage,
  renderEntry,
  useAction,
  useConnection,
  useDialog,
  useEvents,
  writerNow,
} from '@/sdk/solid'
import { EVENT_FEED_SIZE } from '../../shared/events.ts'
import {
  PlanCard,
  PlanningThreadChanged,
  PlanSettings,
  ReadThread,
  Refine,
  RevisionCard,
  SendRevision,
  SetPlan,
} from './refs.ts'
import type { Thread } from './refs.ts'

const settingsDialog = 'automatic-plan.settings'
const person = () => writerNow() === 'person'
const actionClass = 'h-auto rounded border-border px-2 py-1 font-sans text-sm'

function PlanPreferences() {
  const [open, setOpen] = useDialog(settingsDialog)
  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogContent data-agent-hidden class="sm:max-w-lg">
        {() => (
          <>
            <DialogTitle>Automatic Plan</DialogTitle>
            <DialogDescription>
              New plans use this family’s current model and effort. Existing planning threads keep
              their original model. The provider receives bounded task and user input text, without
              the full transcript, tools, images, or memory.
            </DialogDescription>
            <Show when={open()}>
              <PlanFamily />
            </Show>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PlanFamily() {
  const preferences = useAction(PlanSettings, null)
  const [error, setError] = createSignal<string>()
  const selected = () => preferences.data()?.family ?? ''
  const options = () => preferences.data()?.options ?? []
  let select!: HTMLSelectElement
  createEffect(
    () => preferences.data(),
    (data) => {
      select.value = data?.family ?? ''
    },
  )
  async function change() {
    if (!person()) {
      select.value = selected()
      return
    }
    setError(undefined)
    try {
      await api.action(SetPlan, select.value || null)
      await preferences.refetch()
    } catch (failure) {
      select.value = selected()
      setError(errorMessage(failure))
    }
  }
  return (
    <>
      <label class="grid gap-2 text-sm">
        Family for this project
        <select
          ref={select}
          class="rounded border border-border bg-background p-2"
          disabled={!preferences.data()}
          onChange={() => void change()}
        >
          <option value="">Off</option>
          <Show when={selected() && !options().some((choice) => choice.family === selected())}>
            <option value={selected()} disabled>
              {selected()} · unavailable
            </option>
          </Show>
          <For each={options()} keyed={(choice) => choice.family}>
            {(choice) => (
              <option value={choice().family}>
                {choice().family} · {choice().provider}/{choice().id} · {choice().effort}
              </option>
            )}
          </For>
        </select>
      </label>
      <Show when={error() ?? preferences.error()?.message ?? preferences.data()?.problem}>
        {(message) => (
          <p role="alert" class="text-sm text-error">
            {message()}
          </p>
        )}
      </Show>
    </>
  )
}

function PlanningThread(props: { fork: ConversationId }) {
  const [open, setOpen] = createSignal(false)
  const [draft, setDraft] = createStore({
    text: '',
    error: undefined as string | undefined,
    busy: false,
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={(next) => {
        if (person()) setOpen(next)
      }}
    >
      <DialogTrigger data-agent-hidden class="ml-auto text-brand hover:underline">
        Continue planning
      </DialogTrigger>
      <DialogContent data-agent-hidden class="flex max-h-[85dvh] flex-col sm:max-w-xl">
        {() => (
          <>
            <DialogTitle>Planning thread #{props.fork}</DialogTitle>
            <DialogDescription>
              Follow-up stays here until you send a revision. This thread has no tools or
              coordinator permissions.
            </DialogDescription>
            <Show when={open()}>
              <ThreadTurns fork={props.fork} draft={draft} setDraft={setDraft} />
            </Show>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

type Draft = { text: string; error?: string; busy: boolean }

function ThreadTurns(props: {
  fork: ConversationId
  draft: Draft
  setDraft: (change: (draft: Draft) => void) => void
}) {
  const connection = useConnection()
  const events = useEvents({ events: [PlanningThreadChanged], limit: EVENT_FEED_SIZE })
  const latestChange = createMemo(
    () => events()?.find((event) => event.data.fork === props.fork)?.id,
  )
  const [thread, setThread] = createSignal<Thread>()
  const [readError, setReadError] = createSignal<string>()
  let reading: AbortController | undefined
  let closed = false
  async function refresh(fork: ConversationId) {
    if (closed || !person()) return
    reading?.abort()
    const request = new AbortController()
    reading = request
    try {
      const next = await api.action(ReadThread, { fork }, { signal: request.signal })
      if (!request.signal.aborted) {
        setThread(next)
        setReadError(undefined)
      }
    } catch (error) {
      if (!request.signal.aborted) setReadError(errorMessage(error))
    } finally {
      if (reading === request) reading = undefined
    }
  }
  createEffect(
    () =>
      connection().status === 'open' ? { fork: props.fork, change: latestChange() } : undefined,
    (read) => {
      if (read) void refresh(read.fork)
    },
  )
  onCleanup(() => {
    closed = true
    reading?.abort()
  })
  const turns = () => thread()?.turns ?? []
  const latest = () => turns().at(-1)
  const revision = () => turns().length - 1
  const sending = () => thread()?.sending !== undefined
  const sent = () => thread()?.sent === revision()
  const hasRevision = () => revision() > 0 && !!latest()?.answer
  const canSend = () => hasRevision() && !props.draft.busy && !sending() && !sent()
  const canAsk = () =>
    !props.draft.busy &&
    !sending() &&
    !!props.draft.text.trim() &&
    !!turns()[0]?.answer &&
    !!(latest()?.answer || latest()?.error)
  async function act(send: boolean) {
    if (!person() || !(send ? canSend() : canAsk())) return
    const fork = props.fork
    const text = props.draft.text
    const update = props.setDraft
    update((draft) => {
      draft.busy = true
      draft.error = undefined
    })
    try {
      if (send) await api.action(SendRevision, { fork, revision: revision() })
      else {
        await api.action(Refine, { fork, after: turns().length, text })
        update((draft) => {
          if (draft.text === text) draft.text = ''
        })
      }
      await refresh(fork)
    } catch (failure) {
      update((draft) => {
        draft.error = errorMessage(failure)
      })
    } finally {
      update((draft) => {
        draft.busy = false
      })
    }
  }
  return (
    <>
      <div class="text-muted-foreground font-mono text-[11px]">
        {thread()?.model} {thread()?.effort && `· ${thread()?.effort} requested`}
      </div>
      <div class="min-h-0 space-y-3 overflow-y-auto">
        <For each={turns()} keyed={false}>
          {(turn) => (
            <div class="rounded-md border border-border/60 p-3 text-sm whitespace-pre-wrap break-words">
              <Show when={turn().prompt}>
                {(prompt) => <p class="mb-2 text-muted-foreground">{prompt()}</p>}
              </Show>
              <p>{turn().answer ?? turn().error ?? 'Planning…'}</p>
            </div>
          )}
        </For>
      </div>
      <Form class="space-y-2">
        <Textarea
          aria-label="Refine plan"
          rows={2}
          maxlength={3000}
          class="rounded border-border p-2 text-sm"
          value={props.draft.text}
          onValueChange={(text, details) => {
            if (!person()) details.cancel()
            else
              props.setDraft((draft) => {
                draft.text = text
              })
          }}
        />
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Button
            type="submit"
            variant="outline"
            disabled={!canAsk()}
            class={actionClass}
            onClick={() => act(false)}
          >
            Ask in planning thread
          </Button>
          <Show when={hasRevision()}>
            <Button
              variant="outline"
              disabled={!canSend()}
              class={actionClass}
              onClick={() => act(true)}
            >
              {sent() ? 'Revision sent' : 'Send revised plan'}
            </Button>
          </Show>
        </div>
        <Show when={props.draft.error ?? readError()}>
          {(message) => (
            <p role="alert" class="text-sm text-error">
              {message()}
            </p>
          )}
        </Show>
      </Form>
    </>
  )
}

function CardBody(props: { fork: ConversationId; text: string; revision?: number }) {
  return (
    <Card data-automatic-plan={props.fork}>
      <header class="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 font-mono text-[11px]">
        <GitFork aria-hidden="true" class="size-3.5 text-brand" />
        <span>{props.revision === undefined ? 'Plan' : `Revised plan · ${props.revision}`}</span>
        <PlanningThread fork={props.fork} />
      </header>
      <p class="px-3 py-2 text-sm whitespace-pre-wrap break-words">{props.text}</p>
    </Card>
  )
}

export default defineWebExtension({
  slots: { overlay: [PlanPreferences] },
  commands: [
    {
      id: settingsDialog,
      title: 'Automatic Plan…',
      run: (context) => {
        if (person()) context.open(settingsDialog)
      },
    },
  ],
  entries: {
    [PlanCard.kind]: renderEntry(PlanCard, (props) => <CardBody {...props.entry.data} />),
    [RevisionCard.kind]: renderEntry(RevisionCard, (props) => <CardBody {...props.entry.data} />),
  },
})
