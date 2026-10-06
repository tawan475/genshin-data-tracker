-- Planner v2, phase 4b: tasks. One row per task and account: built-in ones
-- (daily commissions, the Spiral Abyss…) by their id with only their state,
-- the player's own by an id the app makes. `data` is the task as JSON (an
-- append-only shape, see plannerTaskInput in @gdt/shared). A new table only:
-- nothing is rebuilt. Apply before deploying the Worker that reads it (CI
-- applies remote migrations first).
CREATE TABLE `planner_tasks` (
	`account_id` integer NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `kind`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
