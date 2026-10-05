-- Whether the user's live hub (worker/services/live.ts) has an open socket:
-- epoch ms while it has, NULL while nobody is listening, so imports skip
-- telling it. A nullable ADD COLUMN: no table rebuild. Apply before deploying
-- the Worker that reads users.live_since.
ALTER TABLE `users` ADD `live_since` integer;
