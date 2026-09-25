-- 0017_lms_snapshot_uniqueness_up.sql
-- Adds uniqueness constraints to lms_impact_snapshots to prevent concurrent
-- calculation races from producing duplicate versions or multiple isLatest rows.

-- ── Pre-constraint cleanup ────────────────────────────────────────────────────

-- Step 1: Build an explicit non_survivor_id → survivor_id mapping, then
-- re-point lms_reports rows to the correct survivor for their own group.
WITH survivors AS (
  -- One canonical row per (tenant_id, cohort_id, snapshot_version) group
  SELECT DISTINCT ON (tenant_id, cohort_id, snapshot_version)
    id AS survivor_id,
    tenant_id,
    cohort_id,
    snapshot_version
  FROM lms_impact_snapshots
  ORDER BY tenant_id, cohort_id, snapshot_version, created_at DESC, id DESC
),
repoint_map AS (
  -- Map every non-survivor id to its group's survivor id
  SELECT s.id AS old_id, sv.survivor_id AS new_id
  FROM lms_impact_snapshots s
  JOIN survivors sv
    ON sv.tenant_id = s.tenant_id
    AND sv.cohort_id = s.cohort_id
    AND sv.snapshot_version = s.snapshot_version
  WHERE s.id <> sv.survivor_id
)
UPDATE lms_reports
SET snapshot_id = repoint_map.new_id
FROM repoint_map
WHERE lms_reports.snapshot_id = repoint_map.old_id;

-- Step 2: All reports now point to survivors — safely delete non-survivors.
DELETE FROM lms_impact_snapshots
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id, cohort_id, snapshot_version) id
  FROM lms_impact_snapshots
  ORDER BY tenant_id, cohort_id, snapshot_version, created_at DESC, id DESC
);

-- Step 3: Ensure at most one is_latest = true per (tenant_id, cohort_id).
UPDATE lms_impact_snapshots
SET is_latest = false
WHERE is_latest = true
  AND id NOT IN (
    SELECT DISTINCT ON (tenant_id, cohort_id) id
    FROM lms_impact_snapshots
    WHERE is_latest = true
    ORDER BY tenant_id, cohort_id, created_at DESC, id DESC
  );

-- ── Constraints ───────────────────────────────────────────────────────────────

-- Unique version per cohort per tenant
ALTER TABLE lms_impact_snapshots
  ADD CONSTRAINT uq_lms_impact_snapshots_version
  UNIQUE (tenant_id, cohort_id, snapshot_version);

-- Partial unique index: at most one isLatest = true row per cohort per tenant
CREATE UNIQUE INDEX uq_lms_impact_snapshots_latest
  ON lms_impact_snapshots (tenant_id, cohort_id)
  WHERE is_latest = true;
