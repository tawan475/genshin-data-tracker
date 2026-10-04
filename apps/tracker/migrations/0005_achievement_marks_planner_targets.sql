CREATE TABLE `achievement_marks` (
	`account_id` integer NOT NULL,
	`achievement_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `achievement_id`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `planner_targets` (
	`account_id` integer NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`target` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `kind`, `key`, `owner`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
