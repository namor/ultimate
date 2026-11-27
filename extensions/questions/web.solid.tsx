import { defineWebExtension, provide } from '@/sdk/solid'
import { MessageAnswers } from '../messages/ui.solid.tsx'
import { HiddenQuestionEntry, MessageQuestions } from './card.solid.tsx'
import { CrossSurfaceDraftSweep } from './sweep.solid.tsx'
import { oldestAsk, openOldestAsk, WaitingPill } from './waiting.solid.tsx'

export default defineWebExtension({
  slots: {
    overlay: [CrossSurfaceDraftSweep],
    'titlebar.right': [{ component: WaitingPill, order: -10 }],
  },
  entries: {
    'questions.asked': HiddenQuestionEntry,
    'questions.answers': HiddenQuestionEntry,
  },
  commands: [
    {
      id: 'questions.oldest',
      title: 'Jump to the oldest thing waiting on you',
      keys: 'alt+w',
      when: () => !!oldestAsk(),
      run: openOldestAsk,
    },
    {
      id: 'questions.open',
      title: 'Show open questions',
      run: (context) => context.openPanel('todos'),
    },
  ],
  provides: [provide(MessageAnswers, MessageQuestions)],
})
