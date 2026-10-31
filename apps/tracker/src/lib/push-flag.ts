/**
 * Whether this browser gets its alerts by Web Push (lib/push.ts sets it): the
 * page's own resin timer (components/planner/resin-alerts.ts) then stays
 * quiet. Apart from lib/push so modules compiled without the DOM can read it.
 */

const KEY = 'gdt:push-alerts:on'

const host = globalThis as {
  localStorage?: {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
  }
}

export function pushOnHere(): boolean {
  try {
    return host.localStorage?.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setPushOnHere(on: boolean): void {
  try {
    if (on) host.localStorage?.setItem(KEY, '1')
    else host.localStorage?.removeItem(KEY)
  } catch {
    // Storage unavailable: the page's timer keeps running beside the pushes.
  }
}
