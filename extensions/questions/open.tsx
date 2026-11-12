import type { Question } from '../messages/refs.ts'

/** The fields of a message the answer card reads. */
export type Message = {
  id: number
  from: number | 'user' | 'remote'
  to: number | 'user' | 'remote'
  reply: boolean
  state: string
  questions?: Question[]
}

/** Whether a message to the user still waits on their answer or dismissal. */
export const waitsOnUser = (message: Message) =>
  message.to === 'user' && message.reply && message.state === 'delivered'

/** The questions of a message while it still waits on the user's reply; none once it is answered or dismissed. */
export function openQuestions(message: Message) {
  return waitsOnUser(message) ? (message.questions ?? []) : []
}

/** Every message that waits on the user, newest first. */
export const waiting = <M extends Message>(messages: readonly M[]) =>
  messages.filter(waitsOnUser).toReversed()

/** Something waiting on the user, where its card is: a message, or the entry of a delivery's card. */
export type Ask = { at: number; conversation: number } & ({ message: number } | { entry: number })

/**
 * Everything waiting on the user, oldest first: messages that wait on their reply, and deliveries that wait on their
 * approval (`at` when queued, `entry` the submitting call). A message from another project has no local asker to open.
 */
export function asks(
  messages: readonly (Message & { at: number })[],
  deliveries: readonly { conversation: number; entry: number; at: number }[],
): Ask[] {
  const asked = messages.flatMap((message) =>
    waitsOnUser(message) && typeof message.from === 'number'
      ? [{ at: message.at, conversation: message.from, message: message.id }]
      : [],
  )
  return [...asked, ...deliveries].toSorted((a, b) => a.at - b.at)
}

/** The newest message showing an answer card: only it takes the desktop 1–9 and Enter keys. */
export function newestAsked(messages: readonly Message[]) {
  return messages.findLast((message) => openQuestions(message).length > 0)?.id
}

/** The card taking desktop keys on a conversation's page: its newest open message with an answer card. */
export const keyCard = (conversation: number | undefined, messages: readonly Message[]) => {
  const id = newestAsked(messages.filter((message) => message.from === conversation))
  return id === undefined ? undefined : `message:${id}`
}
