-- Staff roles and the staff dashboard (worker/routes/staff.ts,
-- worker/services/roles.ts): roles with permission nodes, who holds them, an
-- audit log of staff actions, the suspend / block-uploads flags on users,
-- and indexes for the staff pages. Seeds the Owner (every permission, given
-- only with `pnpm admin:grant`), Admin, Moderator and Support roles. New
-- tables, nullable columns, indexes and seed rows only: nothing is rebuilt.
-- Apply before deploying the Worker that reads them (CI does:
-- db:migrate:remote runs first).
CREATE TABLE `admin_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer NOT NULL,
	`actor_label` text NOT NULL,
	`action` text NOT NULL,
	`target_user_id` integer,
	`target_label` text,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit` (`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_target_idx` ON `admin_audit` (`target_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`position` integer NOT NULL,
	`permissions` text NOT NULL,
	`built_in` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	`assigned_by` integer,
	`assigned_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `user_roles_role_idx` ON `user_roles` (`role_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_reason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `uploads_blocked_at` integer;--> statement-breakpoint
CREATE INDEX `users_created_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE INDEX `snapshots_created_idx` ON `snapshots` (`created_at`);--> statement-breakpoint
CREATE INDEX `snapshots_trash_idx` ON `snapshots` (`account_id`) WHERE "snapshots"."deleted_at" is not null;--> statement-breakpoint
INSERT INTO `roles` (`name`, `color`, `position`, `permissions`, `built_in`, `created_at`) VALUES
	('Owner', '#f59e0b', 1000, '["*"]', 1, unixepoch() * 1000),
	('Admin', '#8b5cf6', 30, '["staff.view","users.view","users.view_private","users.reset_password","users.sessions","users.manage","users.identities","users.delete","data.storage","data.inspect","data.manage","data.delete","site.settings","roles.manage","audit.view"]', 0, unixepoch() * 1000),
	('Moderator', '#0ea5e9', 20, '["staff.view","users.view","users.manage","data.storage","data.manage"]', 0, unixepoch() * 1000),
	('Support', '#10b981', 10, '["staff.view","users.view","users.view_private","users.reset_password","users.sessions"]', 0, unixepoch() * 1000);
