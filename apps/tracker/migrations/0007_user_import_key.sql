-- A user-wide Irminsul key (uploads go to the user's account with the
-- capture's UID) and one account per UID per user. A nullable ADD COLUMN and
-- two partial indexes: no table rebuild. Apply before deploying the Worker
-- that reads users.import_key_hash.
ALTER TABLE `users` ADD `import_key_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_import_key_hash_unique` ON `users` (`import_key_hash`) WHERE "users"."import_key_hash" is not null;--> statement-breakpoint
-- UIDs have always been trimmed by the API; make sure before indexing them.
UPDATE `genshin_accounts` SET `uid` = nullif(trim(`uid`), '') WHERE `uid` <> trim(`uid`) OR `uid` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `genshin_accounts_user_uid_unique` ON `genshin_accounts` (`user_id`,`uid`) WHERE "genshin_accounts"."uid" is not null and "genshin_accounts"."uid" <> '';
