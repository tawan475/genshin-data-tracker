-- Sign in from irminsul (README "Sign in from irminsul"; worker/routes/irminsul*.ts):
-- one-time authorization codes (oauth_codes, hashed, 60 s), and on user_sessions
-- the irminsul session's PC name, upload target (by UID, or one account) and
-- its rotating refresh token's hash (and the previous one, to catch a reused
-- copy). `method` gains 'irminsul' (a Drizzle type only: the column is text).
-- A new table, its index and nullable ADD COLUMNs only: nothing is rebuilt.
-- Apply before deploying the Worker that reads them (CI does).
CREATE TABLE `oauth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`challenge` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`device_name` text NOT NULL,
	`upload_mode` text NOT NULL,
	`upload_account_id` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`session_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_codes_expires_idx` ON `oauth_codes` (`expires_at`);--> statement-breakpoint
ALTER TABLE `user_sessions` ADD `device_name` text;--> statement-breakpoint
ALTER TABLE `user_sessions` ADD `upload_mode` text;--> statement-breakpoint
ALTER TABLE `user_sessions` ADD `upload_account_id` integer;--> statement-breakpoint
ALTER TABLE `user_sessions` ADD `refresh_hash` text;--> statement-breakpoint
ALTER TABLE `user_sessions` ADD `refresh_prev_hash` text;