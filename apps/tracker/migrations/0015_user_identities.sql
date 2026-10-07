-- Sign in with Discord / Google: one row per linked provider account
-- (worker/services/identities.ts). A new table and its indexes only: nothing
-- is rebuilt. Apply before deploying the Worker that reads it (CI does:
-- db:migrate:remote runs first).
CREATE TABLE `user_identities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`email` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_identities_provider_user_unique` ON `user_identities` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_identities_user_provider_unique` ON `user_identities` (`user_id`,`provider`);