CREATE TABLE `account_members` (
	`account_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`invited_by` integer,
	`created_at` integer NOT NULL,
	`accepted_at` integer,
	PRIMARY KEY(`account_id`, `user_id`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_members_user_idx` ON `account_members` (`user_id`,`accepted_at`);