-- Storage format v2 (@gdt/shared codec/store-v2.ts, section-blob.ts,
-- snapshot-meta.ts, catalog-binary.ts): new tables and nullable columns
-- only. Nothing is rebuilt, dropped or rewritten; every existing row reads
-- as before, and the Worker from before this migration keeps working on top
-- of it. Rows written before are converted by the repack job
-- (worker/services/repack.ts); the v1 tables and columns are dropped by a
-- later migration, once that has converted everything.
--
-- section_blobs: a section per row with a stable integer id (AUTOINCREMENT:
-- never reused, which VACUUM keeps), an 8-byte hash for dedup and a base.
-- artifact_chunks: catalog identities packed many to a row.
-- snapshots: the eight *_ref columns name sections by id, content_key keeps
-- 47 bits of the content hash, meta the summary and GOOD header.
CREATE TABLE `artifact_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`first_id` integer NOT NULL,
	`last_id` integer NOT NULL,
	`count` integer NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artifact_chunks_account_idx` ON `artifact_chunks` (`account_id`);--> statement-breakpoint
CREATE TABLE `section_blobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`hash` blob NOT NULL,
	`kind` integer NOT NULL,
	`base_id` integer,
	`data` blob NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `section_blobs_account_hash_unique` ON `section_blobs` (`account_id`,`hash`);--> statement-breakpoint
ALTER TABLE `snapshots` ADD `content_key` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `characters_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `weapons_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `artifacts_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `materials_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `achievements_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `player_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `achievement_times_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `character_extras_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `meta` blob;--> statement-breakpoint
-- stored_bytes counts v2 sections like v1 ones (migration 0002's triggers).
CREATE TRIGGER section_blobs_after_insert AFTER INSERT ON section_blobs BEGIN
  UPDATE genshin_accounts SET stored_bytes = stored_bytes + length(NEW.data) WHERE id = NEW.account_id;
END;
--> statement-breakpoint
CREATE TRIGGER section_blobs_after_delete AFTER DELETE ON section_blobs BEGIN
  UPDATE genshin_accounts SET stored_bytes = stored_bytes - length(OLD.data) WHERE id = OLD.account_id;
END;
