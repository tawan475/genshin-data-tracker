/**
 * Staff roles and the staff dashboard (/api/staff, migration 0020).
 *
 * Roles work like Discord's: a user's permissions are the union of their
 * roles' nodes; `position` is the hierarchy (higher outranks lower). Staff
 * act only on users whose highest role sits below their own, assign only
 * roles below their own, and grant only nodes they hold. The built-in Owner
 * role holds `*` and is given only from the command line.
 */

import { z } from 'zod'
import { usernameSchema } from './api'
import type {
  AccountResponse,
  GenshinServer,
  IdentityResponse,
  OAuthProvider,
  SessionResponse,
} from './api'

/** Every permission node, in the order the Roles page lists them. Managing and deleting are always separate. */
export const PERMISSION_NODES = [
  'staff.view',
  'users.view',
  'users.view_private',
  'users.reset_password',
  'users.sessions',
  'users.manage',
  'users.identities',
  'users.delete',
  'data.storage',
  'data.inspect',
  'data.manage',
  'data.delete',
  'site.settings',
  'roles.manage',
  'audit.view',
] as const
export type PermissionNode = (typeof PERMISSION_NODES)[number]

/** The Owner role's only node: every permission, now and later. */
export const ALL_PERMISSIONS = '*'

/** The nodes grouped as the Roles page shows them, with their labels. */
export const PERMISSION_GROUPS: {
  name: string
  nodes: { node: PermissionNode; label: string }[]
}[] = [
  { name: 'Staff', nodes: [{ node: 'staff.view', label: 'Open the dashboard' }] },
  {
    name: 'Users',
    nodes: [
      { node: 'users.view', label: 'See users' },
      { node: 'users.view_private', label: 'Email, IPs and sessions' },
      { node: 'users.reset_password', label: 'Make reset links' },
      { node: 'users.sessions', label: 'Sign out sessions' },
      { node: 'users.manage', label: 'Rename and suspend' },
      { node: 'users.identities', label: 'Unlink Discord and Google' },
      { node: 'users.delete', label: 'Delete users' },
    ],
  },
  {
    name: 'Data',
    nodes: [
      { node: 'data.storage', label: 'Storage page' },
      { node: 'data.inspect', label: 'View game data' },
      { node: 'data.manage', label: 'Block uploads, quotas, reset keys' },
      { node: 'data.delete', label: 'Delete data' },
    ],
  },
  {
    name: 'Site',
    nodes: [
      { node: 'site.settings', label: 'Sign-up switch and upload limits' },
      { node: 'roles.manage', label: 'Edit and assign lower roles' },
      { node: 'audit.view', label: 'Read the audit log' },
    ],
  },
]

/** Whether a set of nodes (a user's, from MeResponse.permissions) includes `node`. */
export function hasPermission(nodes: readonly string[], node: PermissionNode): boolean {
  return nodes.includes(ALL_PERMISSIONS) || nodes.includes(node)
}

/** The colours a role can take (the Roles page's swatches). */
export const ROLE_COLORS = [
  '#f59e0b',
  '#8b5cf6',
  '#0ea5e9',
  '#10b981',
  '#ec4899',
  '#64748b',
] as const

/**
 * Who may create an account: anyone (`open`), only through Discord or
 * Google (`oauth`), or nobody (`closed`). Existing users always sign in.
 */
export const SIGNUP_MODES = ['open', 'oauth', 'closed'] as const
export type SignupMode = (typeof SIGNUP_MODES)[number]

/** Staff users list: page size and how many a bulk action takes. */
export const STAFF_PAGE_SIZE = 50
export const STAFF_BULK_MAX = 100

// ------------------------------------------------------------------ requests

const roleName = z.string().trim().min(1, 'A name').max(32, 'At most 32 characters')
const roleColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'A colour like #0ea5e9')
const nodeList = z.array(z.enum(PERMISSION_NODES)).max(PERMISSION_NODES.length)

/** `POST /api/staff/roles`. */
export const roleInput = z.object({ name: roleName, color: roleColor, permissions: nodeList })

/** `PATCH /api/staff/roles/:id`: omitted fields stay. */
export const rolePatch = z
  .object({ name: roleName, color: roleColor, permissions: nodeList })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' })

/** `PUT /api/staff/roles/order`: the roles below yours, highest first. */
export const roleOrderRequest = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
})

/** `POST /api/staff/users/:id/suspend` (also the bulk form's reason). */
export const suspendRequest = z.object({ reason: z.string().trim().max(500).default('') })

/** `POST /api/staff/users/:id/rename`. */
export const renameRequest = z.object({ username: usernameSchema })

/** `POST /api/staff/users/bulk`: suspend or delete up to STAFF_BULK_MAX users. */
export const bulkUsersRequest = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('suspend'),
    ids: z.array(z.number().int().positive()).min(1).max(STAFF_BULK_MAX),
    reason: z.string().trim().max(500).default(''),
  }),
  z.object({
    action: z.literal('delete'),
    ids: z.array(z.number().int().positive()).min(1).max(STAFF_BULK_MAX),
    /** The word typed to confirm. */
    confirm: z.literal('DELETE'),
  }),
])

/** `DELETE /api/staff/users/:id`: the username, typed to confirm. */
export const deleteUserRequest = z.object({ username: z.string().trim().min(1).max(64) })

/** `DELETE /api/auth/account`: the user's own username, typed to confirm. */
export const deleteSelfRequest = deleteUserRequest

/** `POST /api/staff/users/:id/uploads`. */
export const uploadsBlockRequest = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(500).default(''),
})

/** `PUT /api/staff/users/:id/quota`: bytes, or null for the site's default. */
export const quotaRequest = z.object({
  bytes: z
    .number()
    .int()
    .min(0)
    .max(100 * 1024 ** 3)
    .nullable(),
})

/**
 * `POST /api/staff/accounts/:id/purge`: snapshots deleted at once (no trash),
 * by id or by capture time (`from` ≤ taken_at < `to`), or the account's trash.
 */
export const purgeRequest = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('snapshots'),
    ids: z.array(z.number().int().positive()).min(1).max(5000),
  }),
  z
    .object({
      kind: z.literal('range'),
      from: z.number().int().min(0),
      to: z.number().int().min(0),
    })
    .refine((body) => body.to > body.from, { message: 'The range is empty', path: ['to'] }),
  z.object({ kind: z.literal('trash') }),
])

/** `POST /api/staff/accounts/:id/inspect`: which page of the account a staff member opened. */
export const INSPECT_VIEWS = [
  'characters',
  'weapons',
  'artifacts',
  'materials',
  'snapshots',
] as const
export type InspectView = (typeof INSPECT_VIEWS)[number]
export const inspectRequest = z.object({ view: z.enum(INSPECT_VIEWS) })

/** `POST /api/staff/users/:id/roles` and `DELETE …/roles/:roleId`. */
export const userRoleRequest = z.object({ roleId: z.number().int().positive() })

/** `PATCH /api/staff/site`: omitted fields stay; a null limit goes back to the default. */
export const siteSettingsPatch = z
  .object({
    signupMode: z.enum(SIGNUP_MODES),
    dailySnapshots: z.number().int().min(0).max(1_000_000).nullable(),
    dailyBytes: z
      .number()
      .int()
      .min(0)
      .max(10 * 1024 ** 3)
      .nullable(),
    storageQuota: z
      .number()
      .int()
      .min(0)
      .max(100 * 1024 ** 3)
      .nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' })

// ----------------------------------------------------------------- responses

export interface RoleRef {
  id: number
  name: string
  color: string
  position: number
}

/** `GET /api/staff/me`: the caller's standing. */
export interface StaffMeResponse {
  permissions: string[]
  /** Highest first. */
  roles: RoleRef[]
}

export type SignInMethod = 'password' | OAuthProvider

/** A user as the list shows them. Fields only `users.view_private` may see are left out otherwise. */
export interface StaffUserRow {
  id: number
  username: string
  createdAt: number
  /** The last sign-in or refresh (stamped at most hourly); null: not since sessions were tracked. */
  lastActiveAt: number | null
  methods: SignInMethod[]
  /** Highest first. */
  roles: RoleRef[]
  accounts: number
  snapshots: number
  /** Stored sections plus artifact catalog chunks: what the storage quota counts. */
  storedBytes: number
  suspendedAt: number | null
  uploadsBlockedAt: number | null
  signupCountry: string | null
  /** `users.view_private` only. */
  signupIp?: string | null
  email?: string | null
}

export interface StaffUserCounts {
  all: number
  new: number
  active: number
  none: number
  suspended: number
  staff: number
}

export const STAFF_USER_FILTERS = ['all', 'new', 'active', 'none', 'suspended', 'staff'] as const
export type StaffUserFilter = (typeof STAFF_USER_FILTERS)[number]

export const STAFF_USER_SORTS = [
  'joined',
  'active',
  'name',
  'accounts',
  'snapshots',
  'storage',
] as const
export type StaffUserSort = (typeof STAFF_USER_SORTS)[number]

/** `GET /api/staff/users?q=&filter=&sort=&dir=&page=`. */
export interface StaffUsersResponse {
  users: StaffUserRow[]
  /** Users matching the search and filter. */
  total: number
  page: number
  pageSize: number
  /** Per filter chip, with the search applied. */
  counts: StaffUserCounts
}

export interface StaffAccountRow {
  id: number
  name: string | null
  uid: string | null
  server: GenshinServer | null
  createdAt: number
  snapshotCount: number
  storedBytes: number
  rawBytes: number
  /** Snapshots in the trash (deleted, purged by maintenance after 30 days). */
  trash: number
  /** The newest capture's last sighting. */
  lastUploadAt: number | null
}

/** A signed-in device of the user (`users.view_private`): their own list's shape. */
export type StaffSessionRow = Omit<SessionResponse, 'current'>

export interface AuditRow {
  id: number
  at: number
  actor: { id: number; label: string; color: string | null }
  action: string
  target: { id: number | null; label: string | null }
  detail: Record<string, unknown>
}

/** What the user may do today and in all (the upload limits). */
export interface StaffUsage {
  storedBytes: number
  /** The quota that applies to them; `quota` is their own, null for the site's default. */
  storageQuota: number
  quota: number | null
  /** The site's default quota (what `quota` null means). */
  siteQuota: number
  daySnapshots: number
  dayBytes: number
  dailySnapshots: number
  dailyBytes: number
}

/** `GET /api/staff/users/:id`. */
export interface StaffUserDetailResponse {
  user: StaffUserRow & {
    hasPassword: boolean
    hasImportKey: boolean
    suspendedReason: string | null
    emailVerified?: boolean
  }
  accounts: StaffAccountRow[]
  /** `users.view_private` only. */
  identities?: IdentityResponse[]
  /** `users.view_private` only. */
  sessions?: StaffSessionRow[]
  /** `audit.view` only: the newest staff actions on this user. */
  history?: AuditRow[]
  usage: StaffUsage | null
  /** Whether the caller outranks this user (every action on them needs it). */
  outranked: boolean
  /** Roles the caller may give or take from them. */
  assignable: RoleRef[]
}

/** `POST /api/staff/users/:id/reset-link`: shown once. */
export interface StaffResetLinkResponse {
  url: string
  expiresAt: number
}

/** `POST /api/staff/accounts/:id/import-key` and `…/users/:id/import-key` don't show the key. */
export interface StaffPurgeResponse {
  deleted: number
}

export interface StaffRole extends RoleRef {
  permissions: string[]
  builtIn: boolean
  members: { id: number; username: string }[]
  /** Whether the caller may edit, delete or assign it (below their highest role). */
  editable: boolean
}

/** `GET /api/staff/roles`. */
export interface StaffRolesResponse {
  /** Highest first. */
  roles: StaffRole[]
  /** The caller's nodes, the ones they may grant. */
  grantable: string[]
}

export const AUDIT_KINDS = ['views', 'deletes', 'users', 'data', 'roles', 'site'] as const
export type AuditKind = (typeof AUDIT_KINDS)[number]

/** `GET /api/staff/audit?q=&actor=&kind=&user=&page=`. */
export interface StaffAuditResponse {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  /** Everyone who has an entry, for the staff filter. */
  actors: { id: number; label: string }[]
}

export interface DayCount {
  /** 'YYYY-MM-DD', UTC. */
  day: string
  [series: string]: number | string
}

export interface StaffRecentSignup {
  id: number
  username: string
  createdAt: number
  method: SignInMethod
  accounts: number
  signupCountry: string | null
  /** Sign-ups from the same IP in the hour around this one (the IP itself is private). */
  sameIp: number
  signupIp?: string | null
}

export interface StaffSiteResponse {
  signupMode: SignupMode
  /** The limits in force, and which are the code's defaults. */
  limits: { dailySnapshots: number; dailyBytes: number; storageQuota: number }
  defaults: { dailySnapshots: number; dailyBytes: number; storageQuota: number }
  providers: { discord: boolean; google: boolean }
  humanCheck: boolean
  email: 'on' | 'paused' | 'off'
  build: { version: string; commit: string; dirty: boolean; builtAt: string } | null
  migrations: { applied: number; pending: string[] }
}

/** `GET /api/staff/overview`. */
export interface StaffOverviewResponse {
  users: { total: number; today: number }
  /** Users signed in or uploading in the last 7 days. */
  active7d: number
  accounts: number
  snapshots: { total: number; today: number }
  storedBytes: number
  suspended: number
  /** 30 UTC days, oldest first: `password`, `discord`, `google`. */
  signups: DayCount[]
  /** 30 UTC days, oldest first: `stored` snapshots and their `bytes`. */
  uploads: DayCount[]
  /** `users.view` only. */
  recent?: StaffRecentSignup[]
  site: StaffSiteResponse
}

export const STORAGE_WINDOWS = ['24h', '7d', '30d'] as const
export type StorageWindow = (typeof STORAGE_WINDOWS)[number]

export const STORAGE_SORTS = ['growth', 'stored', 'quota', 'snapshots'] as const
export type StorageSort = (typeof STORAGE_SORTS)[number]

export interface StaffStorageRow {
  id: number
  username: string
  accounts: number
  snapshots: number
  /** Snapshots stored in the window. */
  newSnapshots: number
  newBytes: number
  storedBytes: number
  rawBytes: number
  trash: number
  /** The quota that applies; `ownQuota` is theirs, null for the site's default. */
  quota: number
  ownQuota: number | null
  uploadsBlocked: boolean
  suspended: boolean
  /** Days of the last 7 the user hit the daily cap (null: not tracked). */
  dailyCapDays: number | null
  flags: ('near_quota' | 'daily_cap' | 'account_limit')[]
}

/** `GET /api/staff/storage?window=&sort=&flagged=&q=&page=`. */
export interface StaffStorageResponse {
  rows: StaffStorageRow[]
  total: number
  page: number
  pageSize: number
  totals: { storedBytes: number; newBytes: number; newSnapshots: number; nearQuota: number }
  flagged: number
  /** The site's storage quota. */
  defaultQuota: number
}

/** `POST /api/staff/accounts/:id/inspect`: the account as its owner's list shows it. */
export interface StaffInspectResponse {
  account: AccountResponse
  owner: { id: number; username: string }
}
