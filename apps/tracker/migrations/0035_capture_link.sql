-- Alerts on every device, Capture presence and the farm plan for Capture
-- (docs/plans/capture-link.md): push subscriptions, each device's alert
-- settings, the users flag writes read, and the published plan. New tables
-- and nullable ADD COLUMNs: nothing is rebuilt.
CREATE TABLE `account_today` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`session_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_ok_at` integer,
	`failures` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `user_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_session_idx` ON `push_subscriptions` (`session_id`);--> statement-breakpoint
ALTER TABLE `user_sessions` ADD `alerts` text;--> statement-breakpoint
ALTER TABLE `users` ADD `alerts_on` integer;