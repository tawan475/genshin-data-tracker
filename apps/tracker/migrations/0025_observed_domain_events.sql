CREATE TABLE `observed_domain_events` (
	`server` text NOT NULL,
	`activity_id` integer NOT NULL,
	`kind` text NOT NULL,
	`begin_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`reports` integer DEFAULT 1 NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`server`, `activity_id`, `begin_at`)
);
--> statement-breakpoint
CREATE INDEX `observed_domain_events_end_idx` ON `observed_domain_events` (`end_at`);