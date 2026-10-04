import type {
  AccountSettingsPatch,
  CharacterTarget,
  CompactSubstat,
  SectionKind,
  SnapshotSummary,
  UserSettingsPatch,
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

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** As typed by the user, for display. */
  username: text('username').notNull(),
  /** Lowercased `username`; what uniqueness and login lookups use. */
  usernameKey: text('username_key').notNull().unique(),
  /**
   * Optional, lowercased; unique when set (SQLite allows many NULLs).
   * Unverified until an email flow exists: never link accounts by it.
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
})

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
  (t) => [index('genshin_accounts_user_idx').on(t.userId)],
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
 * Planner goals. Current levels come from the latest snapshot; only the
 * targets are stored. `owner` is '' for characters and the holding character
 * (or '' for a spare) for weapons, which have no id in GOOD.
 */
export const plannerTargets = sqliteTable(
  'planner_targets',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => genshinAccounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['character', 'weapon', 'item'] }).notNull(),
    key: text('key').notNull(),
    owner: text('owner').notNull().default(''),
    /** Append-only shape: new fields must be optional. */
    target: text('target', { mode: 'json' }).$type<CharacterTarget | WeaponTarget>().notNull(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.kind, t.key, t.owner] })],
)
