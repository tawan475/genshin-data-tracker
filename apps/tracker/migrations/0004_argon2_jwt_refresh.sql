-- Custom SQL. Passwords move to server-side Argon2id and refresh tokens to
-- JWTs carrying users.token_version, so the sessions table goes.
--
-- SQLite only adds a NOT NULL column with a non-NULL default. Existing rows get
-- '' = no password set: they cannot sign in until the password is reset (the
-- old browser-derived verifiers cannot be converted).
ALTER TABLE `users` ADD `password_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `token_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_salt`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_iterations`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_verifier`;--> statement-breakpoint
DROP TABLE `sessions`;
