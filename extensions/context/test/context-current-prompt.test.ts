import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { createModels } from '@earendil-works/pi-ai/models'
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux'
import { createRegistry, Harness, MemoryStorage } from '@earendil-works/pi-durable'
import { expect, it } from 'vitest'
import { actions } from '../server.ts'
import type { ActionContext } from '../../../server/actions.ts'

// The browser keeps the acknowledged prompt entry as durable UI state. A tab that reconnected to another project's
// server on the same port sent that project's entry 4633 as `since` for #41, and the action threw "Entry 4633 is not
// visible from conversation 41" into the host log (#64835).
it('answers the current prompt when `since` names an entry the conversation cannot see', async () => {
  const models = createModels()
  const faux = fauxProvider({ models: [{ id: 'small' }] })
  faux.setResponses([fauxAssistantMessage('One'), fauxAssistantMessage('Two')])
  models.setProvider(faux.provider)
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry: createRegistry() },
    context,
  )
  const agent = { model: { provider: 'faux', modelId: 'small' } }
  const ask = async () => {
    const conversation = await harness.createConversation(
      { ownership: { kind: 'ownerless' }, agent },
      context,
    )
    await (await conversation.submit({ type: 'input', content: 'Hi.' }, context)).wait(context)
    const { items } = await conversation.entries({ order: 'ascending' }, 1, undefined, context)
    return { id: conversation.id, first: items[0].id }
  }
  const [other, { id: shown, first }] = [await ask(), await ask()]
  const call = (since: number) =>
    actions.currentPrompt({ since }, {
      host: { harness: () => harness },
      conversationId: shown,
    } as unknown as ActionContext)

  const own = await call(first)
  expect(own).toHaveProperty('diff')
  // Before the fix this threw; now it answers the current prompt, with no baseline to diff against.
  expect(await call(other.first)).toEqual({ prompt: own.prompt })
})
