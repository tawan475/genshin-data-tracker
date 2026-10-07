import type {
  AccountSettingsPatch,
  CharacterCurrent,
  CharacterTarget,
  CompactSubstat,
  CustomTarget,
  ItemTarget,
  SectionKind,
  SnapshotSummary,
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
    format: text('format').notNull(),
    version: integer('version').notNull(),
    source: text('source').notNull(),
    /** Bytes of the uploaded GOOD file. */
    rawSize: integer('raw_size').notNull(),
    /** Bytes of the sections this snapshot newly stored (shared ones cost nothing). */
    storedSize: integer('stored_size').notNull(),
    /** Identity of the whole inventory; equal hashes mean nothing changed. */
    contentHash: text('content_hash').notNull(),
    charactersHash: text('characters_hash').notNull(),
    weaponsHash: text('weapons_hash').notNull(),
    artifactsHash: text('artifacts_hash').notNull(),
    materialsHash: text('materials_hash').notNull(),
    /** Keyframe the materials section is a delta of (itself when it is one). */
    materialsKeyframeHash: text('materials_keyframe_hash').notNull(),
    achievementsHash: text('achievements_hash'),
    summary: text('summary', { mode: 'json' }).$type<SnapshotSummary>().notNull(),
    deletedAt: integer('deleted_at'),
    // irminsul's own keys (gi_player, gi_achievement_times, gi_characters),
    // one section each; NULL when the upload had none. Added in 0006.
    playerHash: text('player_hash'),
    achievementTimesHash: text('achievement_times_hash'),
    characterExtrasHash: text('character_extras_hash'),
    // The full section `artifacts_hash` / `achievement_times_hash` is a delta
    // of (see "bases & deltas" in @gdt/shared); NULL when it is stored in
    // full, as in every row written before 0009.
    artifactsBaseHash: text('artifacts_base_hash'),
    achievementTimesBaseHash: text('achievement_times_base_hash'),
  },
  (t) => [
    index('snapshots_account_taken_idx').on(t.accountId, t.takenAt),
    uniqueIndex('snapshots_account_taken_live_unique')
      .on(t.accountId, t.takenAt)
      .where(sql`${t.deletedAt} is null`),
  ],
)

/** Deflated snapshot sections, stored once per account by content hash. */
export const blobs = sqliteTable(
  'blobs',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    kind: text('kind').$type<SectionKind>().notNull(),
    data: bytes('data').notNull(),
    rawSize: integer('raw_size').notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.hash] })],
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
