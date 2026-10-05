-- Artifacts and achievement times are stored like materials since this
-- migration: a snapshot usually keeps only a delta against a full "base"
-- section (see "bases & deltas" in packages/shared/src/codec/sections.ts).
-- These columns name the base a row's artifacts / achievement times section
-- is a delta of; NULL means the section is stored in full, which is what
-- every existing row reads. Nullable ADD COLUMNs only: no table rebuild.
-- Apply before deploying the Worker that writes them.
ALTER TABLE `snapshots` ADD `artifacts_base_hash` text;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `achievement_times_base_hash` text;
