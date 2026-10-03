import type {
  AccountSettingsPatch,
  GoodSubstat,
  SectionKind,
  SnapshotSummary,
  UserSettingsPatch,
} from '@gdt/shared'
import { sql } from 'drizzle-orm'
import {
  customType,
  index,
  integer,
  primaryKey,
  real,
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
  /** Lowercased. Unverified until an email flow exists: never link accounts by it. */
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  // The browser derives a key from the password (PBKDF2 with this salt and
  // iteration count); the server stores only HMAC(pepper, key). See auth.
  passwordSalt: text('password_salt').notNull(),
  passwordIterations: integer('password_iterations').notNull(),
  passwordVerifier: text('password_verifier').notNull(),
  settings: text('settings', { mode: 'json' })
    .$type<UserSettingsPatch>()
    .notNull()
    .$defaultFn(() => ({})),
  createdAt: timestamp('created_at'),
})

/** One row per signed-in device; the id is the SHA-256 of its refresh token. */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at'),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: integer('expires_at').notNull(),
    /** Hash of the refresh token this one replaced; honoured briefly so concurrent tabs survive a rotation. */
    previousId: text('previous_id'),
    rotatedAt: integer('rotated_at'),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
    index('sessions_previous_idx').on(t.previousId),
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
    substats: text('substats', { mode: 'json' }).$type<GoodSubstat[]>().notNull(),
    unactivatedSubstats: text('unactivated_substats', { mode: 'json' })
      .$type<GoodSubstat[]>()
      .notNull(),
    totalRolls: integer('total_rolls').notNull(),
    elixerCrafted: integer('elixer_crafted', { mode: 'boolean' }).notNull(),
    cv: real('cv').notNull(),
    rv: real('rv').notNull(),
    createdAt: timestamp('created_at'),
  },
  (t) => [uniqueIndex('artifacts_account_hash_unique').on(t.accountId, t.hash)],
)
