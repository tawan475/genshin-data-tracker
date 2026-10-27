-- The snapshot slot of Teyvat.me Capture 1.6.0's gi_exploration
-- (codec/store-v2.ts SLOTS). A nullable ADD COLUMN: nothing is rebuilt.
-- Apply before deploying the code that writes it.
ALTER TABLE `snapshots` ADD `exploration_ref` integer;