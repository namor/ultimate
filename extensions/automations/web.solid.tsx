import { TimerIcon } from '@lucide/solid'
import { defineWebExtension } from '@/sdk/solid'
import { AutomationCall } from './call.solid.tsx'
import { Chip } from './chip.solid.tsx'
import { Escalated, Failed, Finished, Fired, Writing } from './entry.solid.tsx'
import { openAutomationsPanel } from './navigation.ts'
import { AutomationsPanel } from './panel.solid.tsx'
import { AutomationsSection } from './sidebar.solid.tsx'

export default defineWebExtension({
  tools: { automation: AutomationCall },
  slots: {
    'statusline.right': [{ component: Chip, order: -2 }],
    'sidebar.top': [{ component: AutomationsSection, order: -20 }],
  },
  entries: {
    'automations.fired': Fired,
    'automations.finished': Finished,
    'automations.failed': Failed,
    'automations.escalated': Escalated,
    'automations.writing': Writing,
  },
  panels: [
    {
      id: 'automations',
      title: 'Automations',
      icon: TimerIcon,
      component: AutomationsPanel,
      order: 2.5,
    },
  ],
  commands: [
    {
      id: 'automations.open',
      title: 'Automations…',
      run: openAutomationsPanel,
    },
  ],
})
