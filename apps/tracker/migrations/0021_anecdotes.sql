-- Anecdotes ("Travel Accounts"): hand marks per account (anecdote_marks,
-- like achievement_marks) and the snapshot slot of irminsul's gi_anecdotes
-- section (codec/store-v2.ts SLOTS). A new table and a nullable ADD COLUMN:
-- nothing is rebuilt. Apply before deploying the code that writes them.
CREATE TABLE `anecdote_marks` (
	`account_id` integer NOT NULL,
	`anecdote_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `anecdote_id`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `snapshots` ADD `anecdotes_ref` integer;