import { defineWebExtension, getState, provide } from '@/sdk'
import { MessageAnswers, MessagesDoc } from '../messages/ui.tsx'
import type { MessagesData } from '../messages/refs.ts'
import { MessageQuestions } from './card.tsx'
import { oldestWaiting } from './open.tsx'
import { openMessage, WaitingPill } from './waiting.tsx'

const oldestLocal = () =>
  oldestWaiting(
    (
      (getState().docsOf[1]?.[MessagesDoc.kind] as MessagesData | null | undefined)?.messages ?? []
    ).filter((message) => typeof message.from === 'number'),
  ) as { id: number; from: number } | undefined

export default defineWebExtension({
  entries: {
    // Retired cards have no interaction; hide them instead of exposing their raw JSON.
    'questions.asked': () => null,
    'questions.answers': () => null,
  },
  slots: { 'titlebar.right': [{ component: WaitingPill, order: -10 }] },
  commands: [
    {
      id: 'questions.oldest',
      title: 'Jump to the oldest message waiting on you',
      keys: 'alt+w',
      when: () => oldestLocal() !== undefined,
      run: (context) => {
        const oldest = oldestLocal()
        if (oldest) openMessage(oldest, context)
      },
    },
    {
      id: 'questions.open',
      title: 'Show open questions',
      run: (context) => context.openPanel('todos'),
    },
  ],
  provides: [provide(MessageAnswers, (message) => <MessageQuestions message={message} />)],
})
