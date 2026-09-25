-- 0017_lms_snapshot_uniqueness_down.sql

DROP INDEX IF EXISTS uq_lms_impact_snapshots_latest;

ALTER TABLE lms_impact_snapshots
  DROP CONSTRAINT IF EXISTS uq_lms_impact_snapshots_version;
