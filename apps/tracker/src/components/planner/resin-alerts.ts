/**
 * Resin alerts: a browser notification when an account's Original Resin
 * reaches the amount chosen on this device. There is no push server: the
 * alert is a timer in this tab (or the installed app's window), so it fires
 * only while that is open, also after leaving the Planner. The amount is a
 * per-device choice (notification permission is per browser too), kept by
 * the resin tracker.
 *
 * The timers live at module level, one per account, and the Planner
 * reschedules them whenever the resin it knows changes (a capture, a hand
 * set, another device). Shown through the service worker when there is one
 * (phones need that), else with `new Notification`.
 */

// The Notification API by hand: this module is also compiled for the tests (no DOM types there).
type Permission = 'default' | 'denied' | 'granted'
interface NotificationOptionsLike {
  body: string
  tag: string
  icon: string
  data: { url: string }
}
interface NotificationApi {
  readonly permission: Permission
  requestPermission(): Promise<Permission>
  new (title: string, options: NotificationOptionsLike): unknown
}
interface ServiceWorkerLike {
  getRegistration?(): Promise<
    { showNotification(title: string, options: NotificationOptionsLike): Promise<void> } | undefined
  >
}
const host = globalThis as {
  window?: unknown
  Notification?: NotificationApi
  navigator?: { serviceWorker?: ServiceWorkerLike }
}

export type AlertSupport = 'unsupported' | Permission

/** What this browser allows: no Notification API, or its permission. */
export function alertSupport(): AlertSupport {
  const api = host.window === undefined ? undefined : host.Notification
  return api ? api.permission : 'unsupported'
}

/** Asks for permission (only from a click); answers what the browser now allows. */
export async function askAlertPermission(): Promise<AlertSupport> {
  if (alertSupport() === 'unsupported') return 'unsupported'
  try {
    return await host.Notification!.requestPermission()
  } catch {
    return alertSupport()
  }
}

/** Amounts the alert offers. */
export const ALERT_AMOUNTS = [40, 80, 120, 160, 180, 200] as const

interface Scheduled {
  at: number
  amount: number
  timer: ReturnType<typeof setTimeout>
}
const scheduled = new Map<number, Scheduled>()

/** What fires a notification (replaced in tests). */
let show = async (title: string, body: string, tag: string, url: string) => {
  const options: NotificationOptionsLike = { body, tag, icon: '/icon-192.png', data: { url } }
  const registration = await host.navigator?.serviceWorker
    ?.getRegistration?.()
    .catch(() => undefined)
  if (registration) await registration.showNotification(title, options)
  else if (host.Notification) new host.Notification(title, options)
}

export function setAlertShow(fn: typeof show): void {
  show = fn
}

/**
 * Schedules (or moves, or with `at` null cancels) an account's alert: at
 * `at` (ms) it says resin is at `amount`. Nothing when permission is not
 * granted; past times are dropped, not fired late.
 */
export function scheduleResinAlert(
  accountId: number,
  at: number | null,
  amount: number,
  text: { name: string; url: string },
  now = Date.now(),
): void {
  const before = scheduled.get(accountId)
  if (before && before.at === at && before.amount === amount) return
  if (before) clearTimeout(before.timer)
  scheduled.delete(accountId)
  if (at === null || at <= now || alertSupport() !== 'granted') return
  // setTimeout's limit is ~24.8 days; resin fills in under 27 hours.
  const delay = Math.min(at - now, 2_147_483_000)
  const timer = setTimeout(() => {
    scheduled.delete(accountId)
    if (alertSupport() !== 'granted') return
    void show(`Original Resin ${amount}`, text.name, `resin-${accountId}`, text.url).catch(() => {})
  }, delay)
  scheduled.set(accountId, { at, amount, timer })
}

/** The alert waiting for an account (tests, the bell's tooltip). */
export function scheduledAlert(accountId: number): { at: number; amount: number } | null {
  const s = scheduled.get(accountId)
  return s ? { at: s.at, amount: s.amount } : null
}

export function cancelResinAlerts(): void {
  for (const s of scheduled.values()) clearTimeout(s.timer)
  scheduled.clear()
}
