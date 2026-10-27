-- The snapshot slots of Teyvat.me Capture 1.4.0's keys (codec/store-v2.ts
-- SLOTS): collections2 = gi_collections' later parts (Archive, defeats,
-- Handbook, Aranara, TCG), wardrobe = gi_wardrobe. Nullable ADD COLUMNs:
-- nothing is rebuilt. Apply before deploying the code that writes them.
ALTER TABLE `snapshots` ADD `collections2_ref` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `wardrobe_ref` integer;