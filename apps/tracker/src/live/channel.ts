/**
 * Messages between this browser's tabs (BroadcastChannel), so one tab's read
 * of the account list serves them all:
 * - `reading`: a tab started reading the list; the others put off a read of
 *   their own that the same events asked for.
 * - `list`: that read's answer: the rows when they changed, null for a 304.
 *   Other tabs take the rows and drop the read they put off.
 * - `rows`: a tab re-read accounts itself (after an import or a delete there).
 * Scoped by user id: a tab signed in as someone else ignores them. Without
 * BroadcastChannel every tab simply reads for itself.
 */

import type { AccountResponse } from '@gdt/shared'

export type TabMessage =
  | { type: 'reading'; userId: number; startedAt: number }
  | {
      type: 'list'
      userId: number
      startedAt: number
      etag: string | null
      list: AccountResponse[] | null
    }
  | { type: 'rows'; userId: number; rows: AccountResponse[] }

const NAME = 'gdt:live'

let channel: BroadcastChannel | null | undefined

function open(): BroadcastChannel | null {
  if (channel === undefined) {
    try {
      channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(NAME)
    } catch {
      channel = null
    }
  }
  return channel
}

export function postToTabs(message: TabMessage): void {
  try {
    open()?.postMessage(message)
  } catch {
    // A closed channel or an uncloneable value: the other tabs read for themselves.
  }
}

/** Listens to the other tabs; returns the unsubscribe. */
export function onTabMessage(handler: (message: TabMessage) => void): () => void {
  const target = open()
  if (!target) return () => {}
  const listener = (event: MessageEvent<TabMessage>) => handler(event.data)
  target.addEventListener('message', listener)
  return () => target.removeEventListener('message', listener)
}
