-- The snapshot slot of Teyvat.me Capture's gi_collections section
-- (codec/store-v2.ts SLOTS): the Radiant Spincrystals the player has, later
-- more collections. A nullable ADD COLUMN: nothing is rebuilt. Apply before
-- deploying the code that writes it.
ALTER TABLE `snapshots` ADD `collections_ref` integer;