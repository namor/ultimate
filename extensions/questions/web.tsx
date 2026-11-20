import { ROOT } from '@/sdk'
import { useEffect } from 'react'
import { defineWebExtension, provide, useDocOf, useUiState, writingAs } from '@/sdk'
import { MessageAnswers, MessagesDoc } from '../messages/ui.tsx'
import { MessageQuestions } from './card.tsx'
import { forgetSettled } from './open.tsx'
import { CARDS_KEY } from './state.tsx'
import { currentAsks, openAsk, WaitingPill } from './waiting.tsx'
import type { CardState } from './state.tsx'

function CrossSurfaceDraftSweep() {
  const [cards, setCards] = useUiState<Record<string, CardState>>(CARDS_KEY, {})
  const messages = useDocOf(ROOT, MessagesDoc)?.messages

  useEffect(() => {
    const logAndStoredCardsLoaded = messages && Object.keys(cards).length
    if (logAndStoredCardsLoaded)
      writingAs('app', () => setCards((old) => forgetSettled(old, messages)))
  }, [cards, messages, setCards])
  return null
}

export default defineWebExtension({
  entries: {
    'questions.asked': () => null,
    'questions.answers': () => null,
  },
  slots: {
    overlay: [CrossSurfaceDraftSweep],
    'titlebar.right': [{ component: WaitingPill, order: -10 }],
  },
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
