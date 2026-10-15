-- The snapshot slot of irminsul's gi_tasks section (codec/store-v2.ts SLOTS):
-- what the planner's tasks are ticked from. A nullable ADD COLUMN: nothing is
-- rebuilt. Apply before deploying the code that writes it.
ALTER TABLE `snapshots` ADD `tasks_ref` integer;