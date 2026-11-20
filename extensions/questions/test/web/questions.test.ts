import type { ConversationId, EntryId } from '@earendil-works/pi-durable'
import { describe, expect, it } from 'vitest'
import { deliveryAsk } from '../../../workspaces/ask.tsx'
import type { Delivery } from '../../../workspaces/delivery.ts'
import { asks, forgetSettled, keyCard, newestAsked, openQuestions, waiting } from '../../open.tsx'
import { EMPTY_CARD } from '../../state.tsx'

const question = { text: 'Keep the preview?', kind: 'confirm' as const }
const open = {
  id: 5,
  from: 2,
  to: 'user' as const,
  reply: true,
  state: 'delivered' as const,
  questions: [question],
}

describe('message answer cards', () => {
  it('shows questions only while the message waits on the user', () => {
    expect(openQuestions(open)).toEqual([question])
    expect(openQuestions({ ...open, state: 'answered' })).toEqual([])
    expect(openQuestions({ ...open, state: 'dismissed' })).toEqual([])
    expect(openQuestions({ ...open, state: 'sent' })).toEqual([])
    expect(openQuestions({ ...open, reply: false })).toEqual([])
    expect(openQuestions({ ...open, to: 3 })).toEqual([])
    expect(openQuestions({ ...open, questions: undefined })).toEqual([])
  })
  it('finds the newest message with an open card', () => {
    const later = { ...open, id: 6 }
    expect(newestAsked([open, later, { ...open, id: 7, questions: [] }])).toBe(6)
    expect(newestAsked([open, { ...later, state: 'answered' }])).toBe(5)
    expect(newestAsked([{ ...open, state: 'answered' }])).toBeUndefined()
  })
  it('gives the keys to the newest open message the shown conversation sent', () => {
    const messages = [open, { ...open, id: 6 }, { ...open, id: 7, from: 3 }]
    expect(keyCard(2 as ConversationId, messages)).toBe('message:6')
    expect(keyCard(3 as ConversationId, messages)).toBe('message:7')
    expect(keyCard(4 as ConversationId, messages)).toBeUndefined()
    expect(keyCard(2 as ConversationId, [{ ...open, state: 'answered' }])).toBeUndefined()
  })
})

describe('open questions in To-dos', () => {
  it('lists every question still waiting on the user, newest first, until answered or dismissed', () => {
    const messages = [
      open,
      { ...open, id: 6, state: 'answered' as const },
      { ...open, id: 7, state: 'dismissed' as const },
      { ...open, id: 8, reply: false },
      { ...open, id: 9, to: 3 },
      { ...open, id: 10 },
    ]
    expect(waiting(messages).map((message) => message.id)).toEqual([10, 5])
  })
})

describe('the waiting pill', () => {
  it('lists messages and deliveries waiting on the user oldest first, dropping answered ones', () => {
    const messages = [
      { ...open, id: 4, at: 10, state: 'answered' as const },
      { ...open, at: 30 },
      { ...open, id: 6, at: 50, from: 3 },
      { ...open, id: 7, at: 5, from: 'remote' as const },
    ]
    const delivery = { conversation: 9 as ConversationId, entry: 120 as EntryId, at: 40 }
    expect(asks(messages, [delivery])).toEqual([
      { at: 30, conversation: 2, message: 5 },
      delivery,
      { at: 50, conversation: 3, message: 6 },
    ])
    expect(asks([{ ...messages[1], state: 'dismissed' as const }], [])).toEqual([])
  })
})

describe('deliveries waiting on the user', () => {
  const base = { stage: 'publish', risk: 'high' } as Delivery
  it('asks for a high-risk publication, a non-low merge and a blocked delivery until approved', () => {
    expect(deliveryAsk(base)).toBe('publish')
    expect(deliveryAsk({ ...base, publishApproved: true })).toBeUndefined()
    expect(deliveryAsk({ ...base, risk: 'medium' })).toBeUndefined()
    expect(deliveryAsk({ ...base, stage: 'merge', risk: 'medium' })).toBe('merge')
    expect(deliveryAsk({ ...base, stage: 'merge', mergeApproved: true })).toBeUndefined()
    expect(deliveryAsk({ ...base, stage: 'merge', risk: 'low' })).toBeUndefined()
    expect(deliveryAsk({ ...base, stage: 'blocked' })).toBeUndefined()
    expect(deliveryAsk({ ...base, stage: 'blocked', mergeIntent: true })).toBe('recheck')
    // A block its branch is repairing is not the user's; one escalated to them is (#53902 review).
    const blocked = { ...base, stage: 'blocked' } as Delivery
    expect(deliveryAsk({ ...blocked, wake: { block: 1, to: 'branch' } })).toBeUndefined()
    expect(deliveryAsk({ ...blocked, wake: { block: 2, to: 'user', why: 'x' } })).toBe('recheck')
    expect(deliveryAsk({ ...base, stage: 'ci' })).toBeUndefined()
    expect(deliveryAsk(undefined)).toBeUndefined()
  })
})

describe('what the user did on a card', () => {
  const cards = { 'message:5': EMPTY_CARD, 'message:6': EMPTY_CARD }

  it('is dropped once its message settles, wherever that happened', () => {
    for (const state of ['answered', 'dismissed'] as const)
      expect(forgetSettled(cards, [open, { ...open, id: 6, state }])).toEqual({
        'message:5': EMPTY_CARD,
      })
  })

  it('stays, as the same object, while every message still waits on the user', () => {
    expect(forgetSettled(cards, [open, { ...open, id: 6 }])).toBe(cards)
  })
})
