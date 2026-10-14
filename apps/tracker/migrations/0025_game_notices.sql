CREATE TABLE `game_notices` (
	`server` text NOT NULL,
	`source` text NOT NULL,
	`ann_id` integer NOT NULL,
	`kind` text NOT NULL,
	`start` text NOT NULL,
	`end` text,
	`titles` text NOT NULL,
	`image` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`server`, `source`, `ann_id`)
);
