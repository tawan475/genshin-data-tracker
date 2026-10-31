/**
 * Capture and the tracker, closer (docs/plans/capture-link.md): each device's
 * alert settings, Capture's presence heartbeat and the farm plan the Planner
 * publishes for Capture's Today screen. The presence and today shapes are a
 * wire contract with Teyvat.me Capture: fields are only appended.
 */

import { z } from 'zod'

/** What one device is alerted about (`user_sessions.alerts`). */
export interface DeviceAlerts {
  /** Resin reaches this amount (1–200); null: off. */
  resin: number | null
  /** Resin reaches 200. */
  resinFull: boolean
  /** The last expedition out is back. */
  expeditions: boolean
  /** 20:00 on the first day the Welkin Moon has 3 days or fewer left. */
  welkin: boolean
  /** 22:00 when today's commissions aren't done. */
  commissions: boolean
  /** 20:00 three days before the month's reset when nothing was bought at Paimon's Bargains. */
  bargains: boolean
  /** Drop an alert that falls while Capture says the game runs for that account. */
  quiet: boolean
  /** The device's IANA time zone (the 20:00/22:00 reminders); null: UTC. */
  tz: string | null
  /** The language its notifications are written in (a site language); null: English. */
  lang: string | null
}

/** A device that never chose: resin full only, quiet while playing. */
export const DEFAULT_DEVICE_ALERTS: DeviceAlerts = {
  resin: null,
  resinFull: true,
  expeditions: false,
  welkin: false,
  commissions: false,
  bargains: false,
  quiet: true,
  tz: null,
  lang: null,
}

/** The yes/no kinds, in the order Settings lists them. */
export const ALERT_SWITCHES = [
  'resinFull',
  'expeditions',
  'welkin',
  'commissions',
  'bargains',
] as const satisfies readonly (keyof DeviceAlerts)[]

/** An IANA zone name as `Intl` gives it ("Asia/Bangkok", "UTC"). */
const timeZone = z
  .string()
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_+\-/]*$/)

/** A change to a device's alerts: only the fields sent change. */
export const deviceAlertsPatch = z
  .object({
    resin: z.number().int().min(1).max(200).nullable(),
    resinFull: z.boolean(),
    expeditions: z.boolean(),
    welkin: z.boolean(),
    commissions: z.boolean(),
    bargains: z.boolean(),
    quiet: z.boolean(),
    tz: timeZone.nullable(),
    lang: z
      .string()
      .max(16)
      .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
      .nullable(),
  })
  .partial()
  .strict()

export type DeviceAlertsPatch = z.infer<typeof deviceAlertsPatch>

/** A stored value (whatever an older build wrote) as a whole `DeviceAlerts`. */
export function readDeviceAlerts(stored: unknown): DeviceAlerts {
  const parsed = deviceAlertsPatch.strip().safeParse(stored ?? {})
  return { ...DEFAULT_DEVICE_ALERTS, ...(parsed.success ? parsed.data : {}) }
}

/** Whether the device is alerted about anything at all. */
export const anyAlert = (alerts: DeviceAlerts): boolean =>
  alerts.resin !== null || ALERT_SWITCHES.some((kind) => alerts[kind])

/** `PUT /api/push/subscription`: this browser's push subscription (`PushSubscription.toJSON()`). */
export const pushSubscriptionRequest = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine((url) => url.startsWith('https://'), 'Not an https endpoint'),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .max(128),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .max(64),
  }),
  tz: timeZone.optional(),
})

/** `GET /api/push/config`. */
export interface PushConfigResponse {
  /** Off until the server has its VAPID keys. */
  enabled: boolean
  /** The VAPID public key (base64url) for `pushManager.subscribe`. */
  publicKey: string | null
}

/** What a push message carries (the service worker shows it). */
export interface PushMessage {
  title: string
  body: string
  /** Same tag: a newer alert replaces the older one on the device. */
  tag: string
  /** Opened when the notification is clicked (a site path). */
  url: string
}

// ------------------------------------------------------------------ presence

/** Capture's state: the game closed, running (not decoding), or in game with data flowing. */
export const PRESENCE_STATES = ['stopped', 'running', 'decoding'] as const
export type PresenceState = (typeof PRESENCE_STATES)[number]

/** `POST /api/irminsul/presence` (Capture → tracker). */
export const presenceRequest = z.object({
  v: z.literal(1),
  state: z.enum(PRESENCE_STATES),
  uid: z.number().int().positive().max(0xffff_ffff).nullable().optional(),
  app: z.string().max(32).optional(),
  platform: z.string().max(16).optional(),
})
export type PresenceRequest = z.infer<typeof presenceRequest>

/** A request from the website to the running Capture, delivered once. */
export const CAPTURE_COMMANDS = ['wishes', 'snapshot'] as const
export type CaptureCommandKind = (typeof CAPTURE_COMMANDS)[number]

export const captureCommandRequest = z.object({ kind: z.enum(CAPTURE_COMMANDS) })

/** The answer Capture reads. */
export interface PresenceResponse {
  /** Seconds to the next heartbeat. */
  next: number
  commands: { id: string; kind: CaptureCommandKind }[]
  /** This device's alerts (signed in only; null with an import key or when never set). */
  alerts: DeviceAlerts | null
}

/** Capture playing on one of the user's devices, as the website shows it. */
export interface CapturePresence {
  /** The Capture session row (null: an import key). */
  sid: number | null
  /** The PC or phone's name ("Capture" with an import key). */
  device: string
  state: Exclude<PresenceState, 'stopped'>
  /** Unix ms of the last heartbeat. */
  at: number
  platform: string | null
  app: string | null
}

/** `GET /api/accounts/:id/presence`; also the live event's `presence`. */
export interface PresenceResponseForAccount {
  presence: CapturePresence | null
  /** Commands sent and not yet picked up. */
  pending: CaptureCommandKind[]
}

// ------------------------------------------------------------------ today

const text = (max: number) => z.string().max(max)

/** One card of the farm plan (`FarmCard`, flattened to text). */
export const todayCardSchema = z.object({
  name: text(200),
  detail: text(400),
  runs: z.number().int().min(0).max(100_000).nullable(),
  resin: z.number().int().min(0).max(10_000_000),
  upperBound: z.boolean(),
  items: z
    .array(
      z.object({
        key: text(120),
        name: text(200),
        missing: z.number().int().min(0).max(100_000_000),
      }),
    )
    .max(40),
  who: z.array(text(100)).max(40),
})

/** `PUT /api/accounts/:id/today` (the Planner) and what Capture reads. */
export const todayDigestSchema = z.object({
  v: z.literal(1),
  lang: text(16),
  /** The server's game day the plan is for (0 = Sunday). */
  weekday: z.number().int().min(0).max(6),
  sections: z
    .array(
      z.object({
        key: text(16),
        resin: text(16),
        label: text(100),
        cards: z.array(todayCardSchema).max(60),
      }),
    )
    .max(8),
})
export type TodayDigest = z.infer<typeof todayDigestSchema>

/** `GET /api/irminsul/today`. */
export interface TodayResponse extends TodayDigest {
  account: { id: number; name: string | null }
  /** Unix ms it was published. */
  at: number
}
