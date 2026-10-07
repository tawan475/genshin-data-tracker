import type {
  AccountSettingsPatch,
  CharacterCurrent,
  CharacterTarget,
  CompactSubstat,
  CustomTarget,
  ItemTarget,
  UserSettingsPatch,
  WeaponCurrent,
  WeaponTarget,
} from '@gdt/shared'
import { sql } from 'drizzle-orm'
import {
  customType,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/** BLOB column as Uint8Array, whatever shape the driver hands back. */
const bytes = customType<{ data: Uint8Array; driverData: ArrayBuffer | Uint8Array | number[] }>({
  dataType: () => 'blob',
  toDriver: (value) => value,
  fromDriver: (value) =>
    value instanceof Uint8Array
      ? value
      : Array.isArray(value)
        ? Uint8Array.from(value)
        : new Uint8Array(value),
})

/** Epoch milliseconds, filled in by the Worker on insert. */
const timestamp = (name: string) =>
  integer(name)
    .notNull()
    .$defaultFn(() => Date.now())

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** As typed by the user, for display. */
    username: text('username').notNull(),
    /** Lowercased `username`; what uniqueness and login lookups use. */
    usernameKey: text('username_key').notNull().unique(),
    /**
     * Optional, lowercased; unique when set (SQLite allows many NULLs).
     * `email_verified` is set by a confirmation link (auth_tokens) and
     * cleared when the email changes: never link accounts by an unverified one.
     */
    email: text('email').unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    /** Argon2id PHC string (see lib/password). Empty: no password set, cannot sign in. */
    passwordHash: text('password_hash').notNull(),
    /**
     * Carried by every refresh token; bumping it (password change, "sign out
     * everywhere") invalidates all of them at once. See lib/session.
     */
    tokenVersion: integer('token_version').notNull().default(0),
    settings: text('settings', { mode: 'json' })
      .$type<UserSettingsPatch>()
      .notNull()
      .$defaultFn(() => ({})),
    createdAt: timestamp('created_at'),
    /**
     * SHA-256 of the user's Irminsul key, which uploads to every account of
     * theirs (routed by the capture's UID). NULL: none. Added in 0007.
     */
    importKeyHash: text('import_key_hash'),
    /**
     * Set (epoch ms) while the user's live hub (worker/services/live.ts) has
     * an open socket; NULL when nobody is listening, so writes skip telling
     * it. Kept by the hub on its first connect and last disconnect. Added in
     * 0010.
     */
    liveSince: integer('live_since'),
    /**
     * Bytes this user may store (services/upload-limits.ts), set by staff for
     * one user; NULL: the site's default. Added in 0018.
     */
    storageQuota: integer('storage_quota'),
    /**
     * Where the account was made from (`cf-connecting-ip`, `request.cf`
     * country), so a wave of sign-ups from one address shows. Maintenance
     * clears the IP 90 days after sign-up. Added in 0019.
     */
    signupIp: text('signup_ip'),
    signupCountry: text('signup_country'),
    /** Epoch ms of the last sign-in or refresh, written at most hourly. Added in 0019. */
    lastActiveAt: integer('last_active_at'),
  },
  (t) => [
    uniqueIndex('users_import_key_hash_unique')
      .on(t.importKeyHash)
      .where(sql`${t.importKeyHash} is not null`),
  ],
)

export const genshinAccounts = sqliteTable(
  'genshin_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name'),
    uid: text('uid'),
    server: text('server', { enum: ['AMERICA', 'EUROPE', 'ASIA', 'SAR'] }),
    /** SHA-256 of the import key; keys are 256-bit random, so no slow hash is needed. */
    importKeyHash: text('import_key_hash').notNull().unique(),
    settings: text('settings', { mode: 'json' })
      .$type<AccountSettingsPatch>()
      .notNull()
      .$defaultFn(() => ({})),
    /**
     * Bumped by every write to this account's snapshots. Cached responses and
     * ETags are keyed on it, so one indexed read revalidates any derived view.
     */
    dataVersion: integer('data_version').notNull().default(0),
    latestSnapshotId: integer('latest_snapshot_id'),
    // Recomputed from the source rows by every write (see recomputeAccount), so
    // dashboards read one row instead of scanning snapshots.
    snapshotCount: integer('snapshot_count').notNull().default(0),
    rawBytes: integer('raw_bytes').notNull().default(0),
    storedBytes: integer('stored_bytes').notNull().default(0),
    createdAt: timestamp('created_at'),
  },
  (t) => [
    index('genshin_accounts_user_idx').on(t.userId),
    // One account per UID per user, so a user key's upload has one place to
    // go. Added in 0007; UIDs are trimmed on every write.
    uniqueIndex('genshin_accounts_user_uid_unique')
      .on(t.userId, t.uid)
      .where(sql`${t.uid} is not null and ${t.uid} <> ''`),
  ],
)

export const snapshots = sqliteTable(
  'snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    /** When the inventory was captured (epoch ms). */
    takenAt: integer('taken_at').notNull(),
    /** Latest capture that found this exact inventory; re-uploads only bump it. */
    lastSeenAt: integer('last_seen_at').notNull(),
    createdAt: timestamp('created_at'),
    /** Bytes of the uploaded GOOD file. */
    rawSize: integer('raw_size').notNull(),
    /** Bytes of the sections this snapshot newly stored (shared ones cost nothing). */
    storedSize: integer('stored_size').notNull(),
    deletedAt: integer('deleted_at'),
    // Storage format v2 (@gdt/shared codec/store-v2.ts): the eight sections
    // by `section_blobs.id`, NULL for an optional one the capture lacked.
    // The v1 columns (hex hashes, summary JSON, format/version/source) were
    // dropped by migration 0017 once repack had converted every row.
    /** The first 47 bits of the content hash (codec/section-blob.ts contentKey). */
    contentKey: integer('content_key'),
    charactersRef: integer('characters_ref'),
    weaponsRef: integer('weapons_ref'),
    artifactsRef: integer('artifacts_ref'),
    materialsRef: integer('materials_ref'),
    achievementsRef: integer('achievements_ref'),
    playerRef: integer('player_ref'),
    achievementTimesRef: integer('achievement_times_ref'),
    characterExtrasRef: integer('character_extras_ref'),
    /** Summary, GOOD header and per-login player values (codec/snapshot-meta.ts). */
    meta: bytes('meta'),
  },
  // Every per-account read is of live rows, which this index serves; the
  // trash is only read by maintenance, in whole-table passes (migration 0017
  // dropped the plain (account_id, taken_at) index).
  (t) => [
    uniqueIndex('snapshots_account_taken_live_unique')
      .on(t.accountId, t.takenAt)
      .where(sql`${t.deletedAt} is null`),
  ],
)

/**
 * Snapshot sections in storage format v2 (migration 0016): each stored once
 * per account under the first 8 bytes of its content address, with a stable
 * id that snapshot rows point at. 8 bytes is enough: dedup only ever compares
 * sections of one account, and two different ones sharing 64 bits, among
 * even 100,000 sections in an account, is a ~3·10⁻¹⁰ chance. `kind` is the section kind code (+16 for a
 * delta), `base_id` the blob this one needs to decode (a delta's base, or the
 * blob whose payload is its DEFLATE dictionary), `data` the format byte and
 * payload (@gdt/shared codec/section-blob.ts). Ids are never reused
 * (AUTOINCREMENT), so a stale reference can only miss, never mislead.
 */
export const sectionBlobs = sqliteTable(
  'section_blobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    hash: bytes('hash').notNull(),
    kind: integer('kind').notNull(),
    baseId: integer('base_id'),
    data: bytes('data').notNull(),
  },
  (t) => [uniqueIndex('section_blobs_account_hash_unique').on(t.accountId, t.hash)],
)

/**
 * The artifact catalog in storage format v2 (migration 0016): identities
 * packed many to a row (@gdt/shared codec/catalog-binary.ts) under the same
 * catalog ids, so snapshots point at them unchanged. An import adds one
 * chunk for its new artifacts; repack merges small ones. Ids still come from
 * `artifacts` (AUTOINCREMENT); a row there only lives until its identity is
 * in a chunk.
 */
export const artifactChunks = sqliteTable(
  'artifact_chunks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    firstId: integer('first_id').notNull(),
    lastId: integer('last_id').notNull(),
    count: integer('count').notNull(),
    data: bytes('data').notNull(),
  },
  (t) => [index('artifact_chunks_account_idx').on(t.accountId)],
)

/**
 * The account's artifact catalog: one immutable row per distinct artifact
 * identity ever seen. Snapshots reference rows by id and carry the mutable
 * state (location, lock, astral mark) themselves.
 */
export const artifacts = sqliteTable(
  'artifacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    setKey: text('set_key').notNull(),
    slotKey: text('slot_key').notNull(),
    level: integer('level').notNull(),
    rarity: integer('rarity').notNull(),
    mainStatKey: text('main_stat_key').notNull(),
    /** Compact tuples (see CompactSubstat): the catalog is most of an account's storage. */
    substats: text('substats', { mode: 'json' }).$type<CompactSubstat[]>().notNull(),
    unactivatedSubstats: text('unactivated_substats', { mode: 'json' })
      .$type<CompactSubstat[]>()
      .notNull(),
    totalRolls: integer('total_rolls').notNull(),
    elixerCrafted: integer('elixer_crafted', { mode: 'boolean' }).notNull(),
    createdAt: timestamp('created_at'),
  },
  (t) => [uniqueIndex('artifacts_account_hash_unique').on(t.accountId, t.hash)],
)

/**
 * Achievements marked done by hand. Captured completions come from snapshots
 * (`gi_achievements`); these cover what irminsul hasn't seen. Kept out of the
 * account's settings JSON, which rides along on every account request.
 */
export const achievementMarks = sqliteTable(
  'achievement_marks',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    achievementId: integer('achievement_id').notNull(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.achievementId] })],
)

/**
 * Planner goals, one per kind and key: characters, custom characters (`key`
 * their id, the target says what they are) and extra item needs. Current
 * levels come from the latest snapshot; only the targets are stored.
 * `owner` is always '' now: weapon goals moved to `planner_weapon_goals`
 * (migration 0012), which gives each its own id.
 */
export const plannerTargets = sqliteTable(
  'planner_targets',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['character', 'item', 'custom'] }).notNull(),
    key: text('key').notNull(),
    owner: text('owner').notNull().default(''),
    /** Append-only shape: new fields must be optional. */
    target: text('target', { mode: 'json' })
      .$type<CharacterTarget | CustomTarget | ItemTarget>()
      .notNull(),
    updatedAt: timestamp('updated_at'),
    /**
     * The current state set by hand (a Done, or typed in the goal editor),
     * null for the capture's. It counts only where it is ahead of the
     * capture, so a capture that reaches it retires it. Written by the
     * planner-state route only: goal upserts leave it alone (migration 0011).
     */
    current: text('current', { mode: 'json' }).$type<CharacterCurrent>(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.kind, t.key, t.owner] })],
)

/**
 * Planner weapon goals, each with its own id (made by the app), so two goals
 * can be the same weapon for the same character. `owner` is the character
 * (or custom character id) it is for, '' for a spare. `current` as on
 * planner_targets. Listed in the order they were made (rowid): the first
 * goals of a weapon take the copies the capture has (migration 0012 moved
 * the weapon rows of planner_targets here).
 */
export const plannerWeaponGoals = sqliteTable(
  'planner_weapon_goals',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    key: text('key').notNull(),
    owner: text('owner').notNull().default(''),
    /** Append-only shape: new fields must be optional. */
    target: text('target', { mode: 'json' }).$type<WeaponTarget>().notNull(),
    updatedAt: timestamp('updated_at'),
    current: text('current', { mode: 'json' }).$type<WeaponCurrent>(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.id] })],
)

/**
 * Planner tasks (migration 0013): built-in ones by their id (daily
 * commissions, the Spiral Abyss…: only the state, `{next?, hidden?}`) and
 * the player's own by an id the app makes (`{task, due, position?}`). The
 * row is written whole; `data` is the task without kind and id (see
 * `plannerTaskInput`), an append-only shape.
 */
export const plannerTasks = sqliteTable(
  'planner_tasks',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['builtin', 'custom'] }).notNull(),
    id: text('id').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.kind, t.id] })],
)

/**
 * Hand edits of material counts on top of the newest capture (Planner):
 * the count is `set_value ?? the capture's`, plus `delta`. `base_seen_at` is
 * the `last_seen_at` of the newest capture when the edit was made (0 for
 * none); once the newest capture is a later one, the edit no longer applies
 * and the next write deletes it (irminsul is the truth).
 */
export const inventoryAdjustments = sqliteTable(
  'inventory_adjustments',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    delta: integer('delta').notNull().default(0),
    setValue: integer('set_value'),
    baseSeenAt: integer('base_seen_at').notNull(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.key] })],
)

/**
 * One-time links (migration 0014): email confirmation (`verify_email`, 24 h)
 * and password reset (`reset_password`, 30 min by mail, 24 h when an admin
 * makes one with scripts/admin-reset-link.mjs). Only the SHA-256 of the token
 * is stored; the link carries the token. `email` is the address it was mailed
 * to (NULL for an admin's link): a confirmation only counts while the user's
 * email is still that address, and the per-hour mail limit counts these rows.
 * Kept a day past expiry (so a late click says "expired"), then purged by
 * maintenance.
 */
export const authTokens = sqliteTable(
  'auth_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['verify_email', 'reset_password'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    email: text('email'),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    createdAt: timestamp('created_at'),
  },
  (t) => [
    uniqueIndex('auth_tokens_token_hash_unique').on(t.tokenHash),
    index('auth_tokens_user_kind_idx').on(t.userId, t.kind),
  ],
)

/**
 * Signed-in devices (migration 0019; lib/session): one row per sign-in,
 * named by the `sid` both session JWTs carry. A refresh slides the row
 * (`last_seen_at`, `expires_at`, which equals the refresh JWT's, and where it
 * came from); signing one device out sets `revoked_at`, which refresh and the
 * sensitive routes check. `method`: how it signed in (`legacy`: a refresh
 * token from before rows existed). The IPs are `cf-connecting-ip`, the place
 * `request.cf` (null in dev and tests). Maintenance deletes a row 7 days
 * after it ended. Not `sessions`: migration 0004 dropped a table of that name.
 */
export const userSessions = sqliteTable(
  'user_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    method: text('method', {
      enum: ['password', 'discord', 'google', 'reset', 'legacy'],
    }).notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdIp: text('created_ip'),
    country: text('country'),
    city: text('city'),
    createdAt: timestamp('created_at'),
    lastSeenAt: integer('last_seen_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('user_sessions_user_revoked_idx').on(t.userId, t.revokedAt)],
)

/**
 * Sign-in identities from OAuth providers (migration 0015): Discord or
 * Google, at most one of each per user, and each provider account linked to
 * at most one user. Linked only by a completed sign-in at the provider, never
 * by matching an email. `email` / `email_verified` are what the provider said
 * at the last sign-in, shown in Settings only: they never confirm the
 * account's own email. `last_used_at`: the last sign-in with it (NULL: never,
 * it was linked from Settings).
 */
export const userIdentities = sqliteTable(
  'user_identities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['discord', 'google'] }).notNull(),
    /** Discord's user id (a snowflake) or Google's `sub`. */
    providerUserId: text('provider_user_id').notNull(),
    email: text('email'),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at'),
    lastUsedAt: integer('last_used_at'),
  },
  (t) => [
    uniqueIndex('user_identities_provider_user_unique').on(t.provider, t.providerUserId),
    uniqueIndex('user_identities_user_provider_unique').on(t.userId, t.provider),
  ],
)

/**
 * What each user stored per UTC day (migration 0018), for the daily upload
 * quota (services/upload-limits.ts): counted in the import's own write batch,
 * only for an upload that stored a snapshot (a re-upload or a capture seen
 * again stores nothing and counts nothing). `stored_bytes`: its new sections
 * and catalog chunks. Purged by maintenance after UPLOAD_DAYS_KEPT days.
 */
export const userUploadDays = sqliteTable(
  'user_upload_days',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'YYYY-MM-DD', UTC. */
    day: text('day').notNull(),
    snapshots: integer('snapshots').notNull().default(0),
    storedBytes: integer('stored_bytes').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)

/**
 * Site-wide settings staff can change without a deploy (migration 0018):
 * each overrides a default in code, e.g. `upload.daily_snapshots`
 * (services/upload-limits.ts). A missing or unreadable value means the default.
 */
export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at'),
  /** The staff member who set it; NULL: set by hand (wrangler) or since deleted. */
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
})
