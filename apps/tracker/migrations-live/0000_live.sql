CREATE TABLE `live_batches` (
	`account_id` integer NOT NULL,
	`seq_from` integer NOT NULL,
	`seq_to` integer NOT NULL,
	`at` integer NOT NULL,
	`changes` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`account_id`, `seq_from`)
);
--> statement-breakpoint
CREATE TABLE `live_journals` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`base_key` text NOT NULL,
	`base_snapshot_id` integer NOT NULL,
	`session` text NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`opened_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`changes` integer DEFAULT 0 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`figures` blob,
	`items` blob,
	`day` text DEFAULT '' NOT NULL,
	`day_batches` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `live_journals_user` ON `live_journals` (`user_id`);--> statement-breakpoint
CREATE TABLE `live_points` (
	`account_id` integer NOT NULL,
	`day` text NOT NULL,
	`user_id` integer NOT NULL,
	`data` blob NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `live_points_user` ON `live_points` (`user_id`);