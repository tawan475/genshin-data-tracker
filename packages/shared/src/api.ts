/**
 * Request schemas and response shapes for /api. The Worker validates with
 * these schemas and the browser builds requests against the same ones.
 */

import { z } from 'zod'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password'
import type { AccountSettings, SnapshotSummary, UserSettings } from './index'

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(32, 'At most 32 characters')
  .regex(/^[A-Za-z0-9_.-]+$/, 'Letters, digits, dot, dash and underscore only')

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email())

/** Not trimmed or normalised here: the Worker hashes exactly what was typed (NFKC). */
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `At most ${MAX_PASSWORD_LENGTH} characters`)

export const registerRequest = z.object({
  username: usernameSchema,
  /** Optional; empty means none. */
  email: emailSchema.nullish().or(z.literal('').transform(() => null)),
  password: passwordSchema,
})

/** Username or email. */
export const loginName = z.string().trim().toLowerCase().min(1).max(254)

/** An existing password: only bounded, since older rules may have allowed it. */
const anyPassword = z.string().min(1).max(MAX_PASSWORD_LENGTH)

export const loginRequest = z.object({ login: loginName, password: anyPassword })

export const changePasswordRequest = z.object({
  currentPassword: anyPassword,
  newPassword: passwordSchema,
})

/**
 * Changes the login names. Omitted fields stay as they are; an empty or null
 * email removes it.
 */
export const updateProfileRequest = z
  .object({
    username: usernameSchema.optional(),
    email: emailSchema.nullish().or(z.literal('').transform(() => null)),
  })
  .refine((body) => body.username !== undefined || body.email !== undefined, {
    message: 'Nothing to change',
  })

export const GENSHIN_SERVERS = ['AMERICA', 'EUROPE', 'ASIA', 'SAR'] as const
export type GenshinServer = (typeof GENSHIN_SERVERS)[number]

const REGION_DIGIT: Record<string, GenshinServer> = {
  '6': 'AMERICA',
  '7': 'EUROPE',
  '8': 'ASIA',
  '9': 'SAR',
}

/**
 * The server a UID belongs to. Nine-digit UIDs lead with the region digit;
 * ten-digit ones (a region that ran out of nine) are 1 and then it, so
 * 18xxxxxxxx is Asia. China's (1, 2, 5) and anything else: null.
 */
export function serverFromUid(uid: string): GenshinServer | null {
  if (!/^\d{9,10}$/.test(uid)) return null
  const digit = uid.length === 10 ? (uid[0] === '1' ? uid[1]! : '') : uid[0]!
  return REGION_DIGIT[digit] ?? null
}

export const accountInput = z.object({
  name: z.string().trim().max(64).nullable().optional(),
  uid: z
    .string()
    .trim()
    .regex(/^\d{9,10}$/, 'A UID is 9 or 10 digits')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  server: z.enum(GENSHIN_SERVERS).nullable().optional(),
})

export const snapshotIdsRequest = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
})

export const userSettingsPatch = z
  .object({ theme: z.enum(['system', 'light', 'dark']), use24Hour: z.boolean() })
  .partial()
  .strict()

export const accountSettingsPatch = z
  .object({
    materialsGraph: z
      .object({
        selectedKeys: z.array(z.string().max(100)).max(100),
        groupBy: z.enum(['hour', 'day', 'month', 'year']),
        limit: z.number().int().min(1).max(10_000),
      })
      .partial()
      .strict(),
    traveler: z.enum(['F', 'M']),
    ar: z.number().int().min(1).max(60).nullable(),
    wl: z.number().int().min(0).max(9).nullable(),
    planner: z.object({ azoth: z.boolean(), passives: z.boolean() }).partial().strict(),
  })
  .partial()
  .strict()

// ------------------------------------------------------------ progress

/** A GOOD key (character, weapon or material), as irminsul writes them. */
export const goodKeySchema = z.string().regex(/^[A-Za-z0-9]{1,64}$/, 'Not a GOOD key')

const achievementIds = z.array(z.number().int().positive()).max(5000)

/**
 * Achievements marked done by hand (captured ones come from snapshots).
 * Ids are the game's achievement ids, the same as `gi_achievements`.
 */
export const achievementMarksPatch = z
  .object({ done: achievementIds.default([]), undone: achievementIds.default([]) })
  .refine((body) => body.done.length + body.undone.length > 0, { message: 'Nothing to change' })

const talentLevel = z.number().int().min(1).max(10)

/** Planner goal for a character. Levels stop at 90 until the 95/100 costs are in game-data. */
/** Free text on a goal (plain text, shown as is). */
const goalNote = z.string().max(1000)

export const characterTarget = z.object({
  level: z.number().int().min(1).max(90),
  ascension: z.number().int().min(0).max(6),
  talents: z.object({ auto: talentLevel, skill: talentLevel, burst: talentLevel }),
  /** Inactive goals are kept but left out of the totals. */
  active: z.boolean().default(true),
  note: goalNote.optional(),
  favorite: z.boolean().optional(),
  /** Lower first when inventory is handed out in order; unset goals come last. */
  priority: z.number().int().min(0).max(100_000).optional(),
})

/** Planner goal for a weapon, identified by its key and the character holding it. */
export const weaponTarget = z.object({
  level: z.number().int().min(1).max(90),
  ascension: z.number().int().min(0).max(6),
  refinement: z.number().int().min(1).max(5),
  active: z.boolean().default(true),
  note: goalNote.optional(),
})

/** Extra need for one material on top of every goal (Seelie's custom items). */
export const itemTarget = z.object({
  count: z.number().int().min(1).max(1_000_000_000),
  active: z.boolean().default(true),
  note: goalNote.optional(),
})

const targetRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), key: goodKeySchema }),
  z.object({ kind: z.literal('item'), key: goodKeySchema }),
  z.object({
    kind: z.literal('weapon'),
    key: goodKeySchema,
    /** Character key the weapon belongs to, '' for a spare one (GOOD weapons have no id). */
    owner: goodKeySchema.or(z.literal('')),
  }),
])

export const plannerTargetInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), key: goodKeySchema, target: characterTarget }),
  z.object({ kind: z.literal('item'), key: goodKeySchema, target: itemTarget }),
  z.object({
    kind: z.literal('weapon'),
    key: goodKeySchema,
    owner: goodKeySchema.or(z.literal('')),
    target: weaponTarget,
  }),
])

/** Upserts and removals in one request (a Seelie import sends a few hundred). */
export const plannerTargetsPatch = z
  .object({
    upsert: z.array(plannerTargetInput).max(1000).default([]),
    remove: z.array(targetRef).max(1000).default([]),
  })
  .refine((body) => body.upsert.length + body.remove.length > 0, { message: 'Nothing to change' })

// ------------------------------------------------------- planner state

const MAX_COUNT = 1_000_000_000

/**
 * A hand edit of one material's count, on top of the newest capture:
 * - `set`: the count is this (`add` on top, usually 0);
 * - `set: null`: back to the capture's count (plus `add`; nothing left drops the edit);
 * - `add` alone: add to whatever the count is now (a Done takes materials away).
 */
export const inventoryChange = z
  .object({
    key: goodKeySchema,
    set: z.number().int().min(0).max(MAX_COUNT).nullable().optional(),
    add: z.number().int().min(-MAX_COUNT).max(MAX_COUNT).optional(),
  })
  .refine((c) => c.set !== undefined || c.add !== undefined, { message: 'Nothing to change' })

/** A character's level, ascension and (base) talents, set by hand. */
export const characterCurrent = z.object({
  level: z.number().int().min(1).max(90),
  ascension: z.number().int().min(0).max(6),
  talents: z.object({ auto: talentLevel, skill: talentLevel, burst: talentLevel }),
})

/** A weapon's level, ascension and refinement, set by hand. */
export const weaponCurrent = z.object({
  level: z.number().int().min(1).max(90),
  ascension: z.number().int().min(0).max(6),
  refinement: z.number().int().min(1).max(5),
})

/** A goal's current state set by hand (null: the capture's again). */
export const currentOverride = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('character'),
    key: goodKeySchema,
    current: characterCurrent.nullable(),
  }),
  z.object({
    kind: z.literal('weapon'),
    key: goodKeySchema,
    owner: goodKeySchema.or(z.literal('')),
    current: weaponCurrent.nullable(),
  }),
])

/**
 * Hand edits on top of the newest capture, in one request (a Done sends both
 * kinds). `base` is the capture the edits were made against: its
 * `lastSeenAt`, 0 without one. When the account's newest capture is another
 * one by now, nothing is written and the answer is a 409 (`capture_changed`).
 * Every write also drops the material edits a newer capture has replaced;
 * `prune` asks for just that.
 */
export const plannerStatePatch = z
  .object({
    base: z.number().int().min(0),
    inventory: z.array(inventoryChange).max(1000).default([]),
    current: z.array(currentOverride).max(1000).default([]),
    prune: z.boolean().optional(),
  })
  .refine((body) => body.inventory.length + body.current.length > 0 || body.prune === true, {
    message: 'Nothing to change',
  })
  .refine((body) => new Set(body.inventory.map((c) => c.key)).size === body.inventory.length, {
    message: 'One change per material',
    path: ['inventory'],
  })

// ------------------------------------------------------------------ responses

export interface ApiError {
  error: { code: string; message: string; issues?: { path: string; message: string }[] }
}

export interface MeResponse {
  id: number
  username: string
  email: string | null
  emailVerified: boolean
  settings: UserSettings
  /** Whether the user has an Irminsul key for all their accounts (the key itself is shown once). */
  hasImportKey: boolean
}

export interface AccountResponse {
  id: number
  name: string | null
  uid: string | null
  server: GenshinServer | null
  createdAt: number
  dataVersion: number
  snapshotCount: number
  rawBytes: number
  storedBytes: number
  latest: {
    id: number
    takenAt: number
    lastSeenAt: number
    summary: SnapshotSummary
  } | null
}

export interface AccountCreatedResponse {
  account: AccountResponse
  /** Shown once; only its hash is stored. */
  importKey: string
}

export interface SnapshotResponse {
  id: number
  takenAt: number
  lastSeenAt: number
  createdAt: number
  source: string
  rawSize: number
  storedSize: number
  summary: SnapshotSummary
}

export interface ImportResponse {
  status: 'created' | 'unchanged'
  snapshotId: number
  takenAt: number
  rawSize: number
  storedSize: number
  /** Present only when there is something to say; the import itself went through. */
  warnings?: ImportWarning[]
  /**
   * Where an import key's upload went (`import-by-key` only). With a user key
   * that is the account with the capture's UID, `created` when this upload
   * made it.
   */
  account?: ImportedAccount
}

export interface ImportedAccount {
  id: number
  name: string | null
  uid: string | null
  created: boolean
}

/**
 * What the live socket (`GET /api/live`) sends when the user's accounts
 * change, so open pages update without a reload:
 * - `hello`: first, on every connect: each account's id, data version and
 *   names as they are now, so a tab can tell whether it missed anything while
 *   it had no socket (and only then re-read the list).
 * - `data`: an account's snapshots changed (an import, a capture seen again,
 *   a delete); `dataVersion` is the account's new version, `takenAt` the
 *   capture time for an import.
 * - `accounts`: an account was added, renamed or removed.
 * - `planner`: an account's planner goals or hand edits changed; `tab` is the
 *   tab that sent the change (`x-gdt-tab`), which already has it.
 * Events only say that something changed; the app re-reads the account list
 * (or, for `planner`, an open Planner re-reads its goals and edits).
 */
export type LiveEvent =
  | { type: 'hello'; accounts: LiveAccount[] }
  | { type: 'data'; accountId: number; dataVersion: number | null; takenAt?: number }
  | { type: 'accounts' }
  | { type: 'planner'; accountId: number; tab?: string }

/** An account as the live `hello` describes it. */
export interface LiveAccount {
  id: number
  dataVersion: number
  name: string | null
  uid: string | null
  server: GenshinServer | null
}

/**
 * `uid_mismatch`: the file's `gi_player.uid` is not the account's UID (the
 * capture may be another account's). Stored anyway, as asked.
 */
export interface ImportWarning {
  code: 'uid_mismatch'
  message: string
}

/**
 * An account key names its account. A user key (`scope: "user"`) uploads to
 * every account of the user, so it names none: `accountId`, `uid` and
 * `server` are null and `dashboardUrl` is the account list.
 */
export interface VerifyKeyResponse {
  accountId: number | null
  accountName: string | null
  uid: string | null
  server: GenshinServer | null
  /** This account's page in the web app; irminsul's "Open dashboard" button opens it. */
  dashboardUrl: string
  scope: ImportKeyScope
}

export type ImportKeyScope = 'account' | 'user'

/** A new import key; shown once, only its hash is stored. */
export interface ImportKeyResponse {
  importKey: string
}

export interface AccountSettingsResponse {
  settings: AccountSettings
}

export interface AchievementMarksResponse {
  /** Achievement ids marked done by hand, ascending. */
  done: number[]
}

export type CharacterTarget = z.infer<typeof characterTarget>
export type WeaponTarget = z.infer<typeof weaponTarget>
export type ItemTarget = z.infer<typeof itemTarget>

export type PlannerTarget =
  | { kind: 'character'; key: string; owner: ''; target: CharacterTarget; updatedAt: number }
  | { kind: 'weapon'; key: string; owner: string; target: WeaponTarget; updatedAt: number }
  | { kind: 'item'; key: string; owner: ''; target: ItemTarget; updatedAt: number }

export interface PlannerTargetsResponse {
  targets: PlannerTarget[]
}

export type InventoryChange = z.input<typeof inventoryChange>
export type CharacterCurrent = z.infer<typeof characterCurrent>
export type WeaponCurrent = z.infer<typeof weaponCurrent>

/**
 * One material's hand edit: the count is `set ?? the capture's count`, plus
 * `delta`. It applies while the account's newest capture is the one it was
 * made against (`base`, that capture's `lastSeenAt`, 0 for none) or older;
 * a newer capture replaces it (irminsul is the truth).
 */
export interface InventoryAdjustment {
  key: string
  delta: number
  set: number | null
  base: number
  updatedAt: number
}

/** A goal's current state set by hand; it counts until a capture reaches it. */
export type CurrentOverride =
  | { kind: 'character'; key: string; owner: ''; current: CharacterCurrent }
  | { kind: 'weapon'; key: string; owner: string; current: WeaponCurrent }

export interface PlannerStateResponse {
  /** The newest capture's `lastSeenAt` (null without one): what `base` must be to write. */
  capturedAt: number | null
  adjustments: InventoryAdjustment[]
  overrides: CurrentOverride[]
}
