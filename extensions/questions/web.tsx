import { defineWebExtension, provide } from '@/sdk'
import { MessageAnswers } from '../messages/ui.tsx'
import { MessageQuestions } from './card.tsx'
import { currentAsks, openAsk, WaitingPill } from './waiting.tsx'

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
      title: 'Jump to the oldest thing waiting on you',
      keys: 'alt+w',
      when: () => currentAsks().length > 0,
      run: (context) => {
        const [oldest] = currentAsks()
        if (oldest) openAsk(oldest, context)
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
