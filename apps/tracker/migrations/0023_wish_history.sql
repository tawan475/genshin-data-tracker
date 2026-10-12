-- Wish history (worker/services/wishes.ts): per account its clock and
-- version, and its pulls in compact chunks per UIGF banner type. New tables
-- only. Apply before deploying the code that writes them.
CREATE TABLE `wish_chunks` (
	`account_id` integer NOT NULL,
	`banner` integer NOT NULL,
	`seq` integer NOT NULL,
	`count` integer NOT NULL,
	`newest_id` text,
	`data` blob NOT NULL,
	PRIMARY KEY(`account_id`, `banner`, `seq`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wish_histories` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`timezone` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
