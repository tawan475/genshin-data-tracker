-- The snapshot slot of Teyvat.me Capture 1.8.0+'s new top-level keys
-- (gi_teapot, gi_miliastra; codec/store-v2.ts SLOTS). A nullable ADD COLUMN:
-- nothing is rebuilt. Apply before deploying the code that writes it.
ALTER TABLE `snapshots` ADD `extras_ref` integer;