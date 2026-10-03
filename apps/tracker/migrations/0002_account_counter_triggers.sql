-- Account counters (snapshot_count, raw_bytes, stored_bytes) are maintained by
-- triggers from here on. Recounting them on every write read every snapshot
-- and blob row of the account, and D1 bills and waits on rows read; a trigger
-- sees exactly the rows that changed. A blob insert that hits ON CONFLICT DO
-- NOTHING inserts nothing, so it never fires.
CREATE TRIGGER blobs_after_insert AFTER INSERT ON blobs BEGIN
  UPDATE genshin_accounts SET stored_bytes = stored_bytes + length(NEW.data) WHERE id = NEW.account_id;
END;
--> statement-breakpoint
CREATE TRIGGER blobs_after_delete AFTER DELETE ON blobs BEGIN
  UPDATE genshin_accounts SET stored_bytes = stored_bytes - length(OLD.data) WHERE id = OLD.account_id;
END;
--> statement-breakpoint
CREATE TRIGGER snapshots_after_insert AFTER INSERT ON snapshots WHEN NEW.deleted_at IS NULL BEGIN
  UPDATE genshin_accounts
  SET snapshot_count = snapshot_count + 1, raw_bytes = raw_bytes + NEW.raw_size
  WHERE id = NEW.account_id;
END;
--> statement-breakpoint
CREATE TRIGGER snapshots_after_soft_delete AFTER UPDATE OF deleted_at ON snapshots
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
  UPDATE genshin_accounts
  SET snapshot_count = snapshot_count - 1, raw_bytes = raw_bytes - OLD.raw_size
  WHERE id = OLD.account_id;
END;
--> statement-breakpoint
CREATE TRIGGER snapshots_after_restore AFTER UPDATE OF deleted_at ON snapshots
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL BEGIN
  UPDATE genshin_accounts
  SET snapshot_count = snapshot_count + 1, raw_bytes = raw_bytes + NEW.raw_size
  WHERE id = NEW.account_id;
END;
--> statement-breakpoint
CREATE TRIGGER snapshots_after_delete AFTER DELETE ON snapshots WHEN OLD.deleted_at IS NULL BEGIN
  UPDATE genshin_accounts
  SET snapshot_count = snapshot_count - 1, raw_bytes = raw_bytes - OLD.raw_size
  WHERE id = OLD.account_id;
END;
--> statement-breakpoint
-- Until now the counters were recomputed by the Worker; start the triggers
-- from exact values.
UPDATE genshin_accounts SET
  snapshot_count = (SELECT count(*) FROM snapshots s
                    WHERE s.account_id = genshin_accounts.id AND s.deleted_at IS NULL),
  raw_bytes = (SELECT coalesce(sum(s.raw_size), 0) FROM snapshots s
               WHERE s.account_id = genshin_accounts.id AND s.deleted_at IS NULL),
  stored_bytes = (SELECT coalesce(sum(length(b.data)), 0) FROM blobs b
                  WHERE b.account_id = genshin_accounts.id);
