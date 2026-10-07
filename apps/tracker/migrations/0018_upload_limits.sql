-- Upload limits (worker/services/upload-limits.ts): what each user stored per
-- UTC day (the daily quota), site-wide settings that override the code's
-- defaults, and a per-user storage quota override (NULL: the default). New
-- tables and a nullable column only: nothing is rebuilt. Apply before
-- deploying the Worker that reads them (CI does: db:migrate:remote runs first).
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `user_upload_days` (
	`user_id` integer NOT NULL,
	`day` text NOT NULL,
	`snapshots` integer DEFAULT 0 NOT NULL,
	`stored_bytes` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `storage_quota` integer;