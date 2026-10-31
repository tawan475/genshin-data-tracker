/**
 * Alerts on this browser by Web Push (docs/plans/capture-link.md): permission,
 * the push subscription through the service worker, and telling the server.
 * The server decides when to send; the service worker shows what arrives.
 *
 * iPhones and iPads get push only once the site is on the Home Screen (iOS
 * 16.4+); before that the Push API is missing and `pushSupport` says so.
 */

import { api } from '@/api'
import { pushOnHere, setPushOnHere } from '@/lib/push-flag'

export { pushOnHere }

export type PushSupport = 'unsupported' | 'ios-install' | 'denied' | 'default' | 'granted'

const host = globalThis as {
  window?: unknown
  navigator?: Navigator
  Notification?: typeof Notification
  PushManager?: unknown
}

/** What this browser can do: no Push API (or an iPhone not yet on the Home Screen), or its permission. */
export function pushSupport(): PushSupport {
  if (host.window === undefined) return 'unsupported'
  const nav = host.navigator
  if (!nav?.serviceWorker || !host.PushManager || !host.Notification) {
    const ios = /iPhone|iPad|iPod/.test(nav?.userAgent ?? '')
    return ios ? 'ios-install' : 'unsupported'
  }
  return host.Notification.permission
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const sw = host.navigator?.serviceWorker
  if (!sw) return null
  return (await sw.getRegistration()) ?? null
}

/** This browser's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    return (await (await registration())?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const plain = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export type EnableResult = 'on' | 'denied' | 'unsupported' | 'off-server'

/** Asks for permission (from a click), subscribes and tells the server. */
export async function enablePush(): Promise<EnableResult> {
  const support = pushSupport()
  if (support === 'unsupported' || support === 'ios-install') return 'unsupported'
  const config = await api.pushConfig()
  if (!config.enabled || !config.publicKey) return 'off-server'
  const permission = await host.Notification!.requestPermission()
  if (permission !== 'granted') return 'denied'
  const sw = host.navigator!.serviceWorker
  const reg = (await registration()) ?? (await sw.ready)
  let subscription = await reg.pushManager.getSubscription()
  // A subscription made for another server key can't be used: start over.
  const key = keyBytes(config.publicKey)
  const current = subscription?.options.applicationServerKey
  if (subscription && current && !sameBytes(new Uint8Array(current), key)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  })
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await api.pushSubscribe({ endpoint: json.endpoint, keys: json.keys, tz: timeZone() })
  setPushOnHere(true)
  return 'on'
}

/** Ends this browser's subscription here and on the server. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription()
  setPushOnHere(false)
  if (!subscription) return
  const endpoint = subscription.endpoint
  try {
    await subscription.unsubscribe()
  } finally {
    await api.pushUnsubscribe(endpoint)
  }
}

/** Forgets the flag (signed out: the server dropped the subscription with the session). */
export function forgetPush(): void {
  setPushOnHere(false)
}

export function timeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}
