-- Custom SQL (drizzle-kit generated a table rebuild). D1 ignores
-- `PRAGMA foreign_keys=OFF` inside a migration, so `DROP TABLE users` would
-- cascade-delete every session, account and snapshot. Swap the column instead.
ALTER TABLE `users` ADD `email_new` text;--> statement-breakpoint
UPDATE `users` SET `email_new` = `email`;--> statement-breakpoint
DROP INDEX `users_email_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `users` RENAME COLUMN `email_new` TO `email`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
