/**
 * The `gdt-live` database (binding LIVE_DB; docs/plans/live-sync.md §7.1):
 * the open live journal of each account, its batches and the chart points.
 * Kept apart from `gdt` by purpose. No foreign keys: account and user ids
 * name rows of `gdt` (services/live-sync.ts deletes with them).
 * Migrations: `migrations-live/` (drizzle.live.config.ts).
 */

import { customType, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

/** One row per account: the journal that follows the account's newest snapshot. */
export const liveJournals = sqliteTable(
  'live_journals',
  {
    accountId: integer('account_id').primaryKey(),
    userId: integer('user_id').notNull(),
    /** The `live.base` the import answered with (the snapshot's content key, base 36). */
    baseKey: text('base_key').notNull(),
    baseSnapshotId: integer('base_snapshot_id').notNull(),
    /** The base snapshot's `gi_capture.session` ('' when it had none: any session continues). */
    session: text('session').notNull(),
    lastSeq: integer('last_seq').notNull().default(0),
    /** Unix ms: the base snapshot's capture time. */
    openedAt: integer('opened_at').notNull(),
    /** Unix ms: the last batch (server clock). */
    updatedAt: integer('updated_at').notNull(),
    /** Distinct paths stored so far (the collapse rule). */
    changes: integer('changes').notNull().default(0),
    /** Bytes of the journal's batch rows. */
    bytes: integer('bytes').notNull().default(0),
    /** The running chart figures (encodeFigures). */
    figures: bytes('figures'),
    /** The base snapshot's guid → fingerprint index (encodeItemIndex); null without guids. */
    items: bytes('items'),
    /** UTC day of `day_batches`, the daily batch cap's counter (kept across snapshots). */
    day: text('day').notNull().default(''),
    dayBatches: integer('day_batches').notNull().default(0),
  },
  (t) => [index('live_journals_user').on(t.userId)],
)

/** The open journal's changes, merged per 10 minutes (encodeChanges). */
export const liveBatches = sqliteTable(
  'live_batches',
  {
    accountId: integer('account_id').notNull(),
    seqFrom: integer('seq_from').notNull(),
    seqTo: integer('seq_to').notNull(),
    /** Unix ms (server clock) of the row's first batch. */
    at: integer('at').notNull(),
    /** Distinct paths in `data`. */
    changes: integer('changes').notNull(),
    data: bytes('data').notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.seqFrom] })],
)

/** Chart points: one row per account per UTC day (encodePoints). */
export const livePoints = sqliteTable(
  'live_points',
  {
    accountId: integer('account_id').notNull(),
    /** YYYY-MM-DD, UTC. */
    day: text('day').notNull(),
    userId: integer('user_id').notNull(),
    data: bytes('data').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.day] }), index('live_points_user').on(t.userId)],
)
