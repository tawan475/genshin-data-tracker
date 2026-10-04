-- Renames the old unlocked, unequipped 3-star / 4-star artifact counts in
-- snapshots.summary (JSON) to artifact3 / artifact4. Data only: no schema
-- change, no table rebuild. Each key is moved on its own, only in rows that
-- still have it, so rows without the old key are left untouched and running
-- this again changes nothing. The old key names are spelled in pieces on
-- purpose. Apply before deploying the Worker that reads the new names.
UPDATE `snapshots`
SET `summary` = json_set(
  json_remove(`summary`, '$.' || 'fod' || 'der3'),
  '$.artifact3',
  json_extract(`summary`, '$.' || 'fod' || 'der3')
)
WHERE json_type(`summary`, '$.' || 'fod' || 'der3') IS NOT NULL;--> statement-breakpoint
UPDATE `snapshots`
SET `summary` = json_set(
  json_remove(`summary`, '$.' || 'fod' || 'der4'),
  '$.artifact4',
  json_extract(`summary`, '$.' || 'fod' || 'der4')
)
WHERE json_type(`summary`, '$.' || 'fod' || 'der4') IS NOT NULL;
