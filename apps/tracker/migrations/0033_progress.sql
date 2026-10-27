-- The snapshot slot of Teyvat.me Capture 1.7.0's gi_achievement_progress
-- and gi_events (codec/store-v2.ts SLOTS). A nullable ADD COLUMN: nothing is
-- rebuilt. Apply before deploying the code that writes it.
ALTER TABLE `snapshots` ADD `progress_ref` integer;