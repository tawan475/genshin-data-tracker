-- DO NOT SHIP until repack reports nothing left in production:
-- `GET /api/admin/repack` (x-diag-key) must answer remaining.snapshots = 0.
--
-- Drops storage format v1 now that every row is v2 (repack converted them;
-- see worker/services/repack.ts): the v1 columns of `snapshots`, the v1
-- `blobs` table (its triggers go with it) and the plain (account_id,
-- taken_at) index, which nothing needs any more (every per-account read is
-- of live rows, served by snapshots_account_taken_live_unique; maintenance
-- reads the trash in whole-table passes). `artifacts` stays: imports still
-- get their catalog ids there.
--
-- Native DROP COLUMN / DROP INDEX / dropping a child table only: no table is
-- rebuilt, nothing cascades. The Worker from the storage v2 commit already
-- runs on this schema (every query naming v1 columns falls back without
-- them), so this can ship on its own.
--
-- Refuses to run while any v1 row is left: the CHECK fails the insert below,
-- and with it the migration.
CREATE TABLE IF NOT EXISTS `_storage_v1_guard` (`v1_rows` integer NOT NULL CHECK (`v1_rows` = 0));
--> statement-breakpoint
INSERT INTO `_storage_v1_guard` SELECT count(*) FROM `snapshots` WHERE `characters_ref` IS NULL;
--> statement-breakpoint
DROP TABLE `_storage_v1_guard`;
--> statement-breakpoint
DROP INDEX `snapshots_account_taken_idx`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `format`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `version`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `source`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `content_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `characters_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `weapons_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `artifacts_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `materials_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `materials_keyframe_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `achievements_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `summary`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `player_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `achievement_times_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `character_extras_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `artifacts_base_hash`;--> statement-breakpoint
ALTER TABLE `snapshots` DROP COLUMN `achievement_times_base_hash`;--> statement-breakpoint
DROP TABLE `blobs`;
