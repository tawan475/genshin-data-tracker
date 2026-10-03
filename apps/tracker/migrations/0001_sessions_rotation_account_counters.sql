ALTER TABLE `genshin_accounts` ADD `snapshot_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `genshin_accounts` ADD `raw_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `genshin_accounts` ADD `stored_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `previous_id` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `rotated_at` integer;--> statement-breakpoint
CREATE INDEX `sessions_previous_idx` ON `sessions` (`previous_id`);