CREATE TABLE `artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`hash` text NOT NULL,
	`set_key` text NOT NULL,
	`slot_key` text NOT NULL,
	`level` integer NOT NULL,
	`rarity` integer NOT NULL,
	`main_stat_key` text NOT NULL,
	`substats` text NOT NULL,
	`unactivated_substats` text NOT NULL,
	`total_rolls` integer NOT NULL,
	`elixer_crafted` integer NOT NULL,
	`cv` real NOT NULL,
	`rv` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_account_hash_unique` ON `artifacts` (`account_id`,`hash`);--> statement-breakpoint
CREATE TABLE `blobs` (
	`account_id` integer NOT NULL,
	`hash` text NOT NULL,
	`kind` text NOT NULL,
	`data` blob NOT NULL,
	`raw_size` integer NOT NULL,
	PRIMARY KEY(`account_id`, `hash`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `genshin_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text,
	`uid` text,
	`server` text,
	`import_key_hash` text NOT NULL,
	`settings` text NOT NULL,
	`data_version` integer DEFAULT 0 NOT NULL,
	`latest_snapshot_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genshin_accounts_import_key_hash_unique` ON `genshin_accounts` (`import_key_hash`);--> statement-breakpoint
CREATE INDEX `genshin_accounts_user_idx` ON `genshin_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`taken_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`format` text NOT NULL,
	`version` integer NOT NULL,
	`source` text NOT NULL,
	`raw_size` integer NOT NULL,
	`stored_size` integer NOT NULL,
	`content_hash` text NOT NULL,
	`characters_hash` text NOT NULL,
	`weapons_hash` text NOT NULL,
	`artifacts_hash` text NOT NULL,
	`materials_hash` text NOT NULL,
	`materials_keyframe_hash` text NOT NULL,
	`achievements_hash` text,
	`summary` text NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshots_account_taken_idx` ON `snapshots` (`account_id`,`taken_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_account_taken_live_unique` ON `snapshots` (`account_id`,`taken_at`) WHERE "snapshots"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`username_key` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`password_verifier` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_key_unique` ON `users` (`username_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);