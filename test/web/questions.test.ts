import { describe, expect, it } from 'vitest'
import { deliveryAsk } from '../../extensions/workspaces/ask.tsx'
import type { Delivery } from '../../extensions/workspaces/delivery.ts'
import {
  asks,
  keyCard,
  newestAsked,
  openQuestions,
  waiting,
} from '../../extensions/questions/open.tsx'

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
    expect(keyCard(2, messages)).toBe('message:6')
    expect(keyCard(3, messages)).toBe('message:7')
    expect(keyCard(4, messages)).toBeUndefined()
    expect(keyCard(2, [{ ...open, state: 'answered' }])).toBeUndefined()
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
    const delivery = { conversation: 9, entry: 120, at: 40 }
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
    expect(deliveryAsk({ ...base, stage: 'blocked' })).toBe('recheck')
    expect(deliveryAsk({ ...base, stage: 'ci' })).toBeUndefined()
    expect(deliveryAsk(undefined)).toBeUndefined()
  })
})
