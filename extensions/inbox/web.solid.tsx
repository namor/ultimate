import { InboxIcon } from '@lucide/solid'
import { createMemo } from 'solid-js'
import { defineWebExtension, provide } from '@/sdk/solid'
import { UnderUltimate } from '../sidebar/ui.solid.tsx'
import { DeliveryCard, deliveryAsk, useWorkspaceIndex } from '../workspaces/ui.solid.tsx'
import { SURFACE } from './items.ts'
import { InboxItems } from './points.ts'
import type { InboxItem } from './points.ts'
import { Inbox, InboxSidebar, WaitingBadge, WaitingLink } from './surface.solid.tsx'

function useDeliveryItems() {
  const index = useWorkspaceIndex()
  return createMemo(() => {
    return index().queue.flatMap<InboxItem>(({ id, conversationId, delivery, steps }) => {
      if (!delivery) return []
      const ask = deliveryAsk(delivery)
      if (!ask) return []
      return [
        {
          key: `delivery:${id}`,
          at: steps[0]?.at ?? 0,
          conversation: conversationId,
          tag: 'delivery',
          title: ask === 'recheck' ? 'Review blocked delivery' : 'Approve PR',
          gist: `${delivery.settings.repository} → ${delivery.settings.base}`,
          get pane() {
            return <DeliveryCard context={`Inbox delivery ${id}`} delivery={delivery} id={id} />
          },
        },
      ]
    })
  })
}

export default defineWebExtension({
  slots: { overlay: [WaitingLink] },
  surfaces: [
    {
      id: SURFACE,
      title: 'Inbox',
      icon: InboxIcon,
      description: 'Everything that waits on you, oldest first, answered in place',
      order: 10,
      component: Inbox,
      badge: WaitingBadge,
    },
  ],
  commands: [
    {
      id: 'inbox.open',
      title: 'Open Inbox',
      run: (context) => context.showSurface(SURFACE),
    },
  ],
  provides: [provide(UnderUltimate, InboxSidebar), provide(InboxItems, useDeliveryItems)],
})
