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

export const GENSHIN_SERVERS = ['AMERICA', 'EUROPE', 'ASIA', 'SAR'] as const
export type GenshinServer = (typeof GENSHIN_SERVERS)[number]

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
  .object({ theme: z.enum(['light', 'dark']), use24Hour: z.boolean() })
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
  })
  .partial()
  .strict()

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
}

export interface VerifyKeyResponse {
  accountId: number
  accountName: string | null
  uid: string | null
  server: GenshinServer | null
}

export interface AccountSettingsResponse {
  settings: AccountSettings
}
