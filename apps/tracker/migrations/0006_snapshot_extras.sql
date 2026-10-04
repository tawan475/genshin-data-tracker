-- irminsul's own top-level keys (gi_player, gi_achievement_times,
-- gi_characters) are stored as sections like the others; these columns name
-- them. Nullable ADD COLUMNs only: no table rebuild, existing rows read NULL
-- ("none"). Apply before deploying the Worker that writes them.
ALTER TABLE `snapshots` ADD `player_hash` text;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `achievement_times_hash` text;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `character_extras_hash` text;