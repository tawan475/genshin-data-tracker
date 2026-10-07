-- Device sessions (worker/lib/session.ts): one user_sessions row per sign-in,
-- named by the sid the session JWTs carry, with where it came from (IPs
-- included, deleted a week after the session ends). users gains the sign-up
-- IP and country and the last time it was active. A new table, its index and
-- nullable ADD COLUMNs only: nothing is rebuilt. Apply before deploying the
-- Worker that reads them (CI does: db:migrate:remote runs first).
CREATE TABLE `user_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`method` text NOT NULL,
	`user_agent` text,
	`ip` text,
	`created_ip` text,
	`country` text,
	`city` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_sessions_user_revoked_idx` ON `user_sessions` (`user_id`,`revoked_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `signup_ip` text;--> statement-breakpoint
ALTER TABLE `users` ADD `signup_country` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_active_at` integer;