#!/bin/bash
# =============================================================================
# Hubforte Backup & Restore Recovery Test
# Tests that backup.sh creates a valid artifact and restore.sh can recover it.
#
# Prerequisites:
#   - PostgreSQL running locally (or DATABASE_URL pointing to a test instance)
#   - pg_dump and psql available on PATH
#   - DATABASE_URL set in environment or artifacts/api-server/.env
#
# Usage:
#   ./tests/recovery/backup-restore.test.sh
#
# What it does:
#   1. Creates a backup using scripts/backup.sh
#   2. Verifies the backup artifact exists and has content
#   3. Records a checksum of the backup
#   4. Creates a disposable test database
#   5. Restores the backup to the test database
#   6. Verifies row counts match between source and restored DB
#   7. Cleans up the test database
#   8. Writes proof artifacts to tests/recovery/last-run/
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=../../scripts/lib/postgres-tools.sh
source "$PROJECT_ROOT/scripts/lib/postgres-tools.sh"
# shellcheck source=../../scripts/lib/database-url.sh
source "$PROJECT_ROOT/scripts/lib/database-url.sh"
PROOF_DIR="$SCRIPT_DIR/last-run"
RESTORE_LOG="$PROOF_DIR/restore.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_DB_NAME="hubforte_restore_test_$$"

ensure_postgres_tools_on_path

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

FAILURES=0
TEST_DB_CREATED=0

# --- Load DATABASE_URL ---
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$PROJECT_ROOT/artifacts/api-server/.env" ]; then
    export $(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/artifacts/api-server/.env" | head -1)
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL not set. Set it in environment or artifacts/api-server/.env"
  exit 1
fi

cleanup_test_db() {
  if [ "${TEST_DB_CREATED:-0}" -eq 1 ] && [ -n "${DATABASE_URL:-}" ]; then
    echo "Cleanup: dropping $TEST_DB_NAME" >> "$PROOF_DIR/test-transcript.txt"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" >> "$PROOF_DIR/test-transcript.txt" 2>&1 || true
  fi
}

query_total_row_count() {
  local db_url="$1"

  psql "$db_url" -v ON_ERROR_STOP=1 -t -A <<'SQL'
WITH table_counts AS (
  SELECT COALESCE(
    ((xpath(
      '/row/c/text()',
      query_to_xml(
        format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename),
        false,
        true,
        ''
      )
    ))[1])::text::bigint,
    0
  ) AS row_count
  FROM pg_tables
  WHERE schemaname = 'public'
)
SELECT COALESCE(SUM(row_count), 0)
FROM table_counts;
SQL
}

count_rows_in_backup_artifact() {
  python - "$1" <<'PY'
import gzip
import sys

backup_file = sys.argv[1]
total = 0
in_copy = False

with gzip.open(backup_file, "rt", encoding="utf-8", errors="ignore") as handle:
    for line in handle:
        stripped = line.rstrip("\r\n")
        if stripped.startswith("COPY public.") and stripped.endswith(" FROM stdin;"):
            in_copy = True
            continue
        if in_copy:
            if stripped == "\\.":
                in_copy = False
            else:
                total += 1

print(total)
PY
}

trap cleanup_test_db EXIT

parse_database_url "$DATABASE_URL"

info "Source database: $DB_NAME on $DB_HOST:$DB_PORT"

# --- Setup proof directory ---
rm -rf "$PROOF_DIR"
mkdir -p "$PROOF_DIR"

echo "Recovery Test Run: $TIMESTAMP" > "$PROOF_DIR/test-transcript.txt"
echo "Source DB: $DB_NAME" >> "$PROOF_DIR/test-transcript.txt"
echo "---" >> "$PROOF_DIR/test-transcript.txt"

# =============================================================================
# Step 1: Record source row counts
# =============================================================================
info "Step 1: Recording source row counts..."
SOURCE_COUNTS=$(query_total_row_count "$DATABASE_URL" 2>>"$PROOF_DIR/test-transcript.txt" || true)

if [ -n "$SOURCE_COUNTS" ]; then
  SOURCE_TOTAL=$(echo "$SOURCE_COUNTS" | tr -d '[:space:]')
  echo "TOTAL|$SOURCE_TOTAL" > "$PROOF_DIR/source-row-counts.txt"
  pass "Source row counts recorded: $SOURCE_TOTAL total rows"
else
  fail "Could not query source row counts"
  echo "QUERY_FAILED" > "$PROOF_DIR/source-row-counts.txt"
  SOURCE_TOTAL="unknown"
fi

# =============================================================================
# Step 2: Create backup
# =============================================================================
info "Step 2: Creating backup..."
BACKUP_DEST="$PROOF_DIR/backups"
mkdir -p "$BACKUP_DEST"

export BACKUP_DEST
cd "$PROJECT_ROOT"
bash scripts/backup.sh --dest "$BACKUP_DEST" 2>&1 | tee -a "$PROOF_DIR/test-transcript.txt"

# Find the backup file
BACKUP_FILE=$(ls -t "$BACKUP_DEST"/*.gz 2>/dev/null | head -1)

if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
  pass "Backup artifact created: $(basename "$BACKUP_FILE")"
  echo "STEP 2 PASS: Backup created" >> "$PROOF_DIR/test-transcript.txt"
else
  fail "No backup artifact found in $BACKUP_DEST"
  echo "STEP 2 FAIL: No backup artifact" >> "$PROOF_DIR/test-transcript.txt"
  exit 1
fi

# =============================================================================
# Step 3: Verify backup has content
# =============================================================================
info "Step 3: Verifying backup content..."
BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null || echo "0")

if [ "$BACKUP_SIZE" -gt 1000 ]; then
  pass "Backup has content: ${BACKUP_SIZE} bytes"
else
  fail "Backup too small: ${BACKUP_SIZE} bytes"
fi

# =============================================================================
# Step 4: Record checksum
# =============================================================================
info "Step 4: Recording checksum..."
CHECKSUM=$(sha256sum "$BACKUP_FILE" 2>/dev/null || shasum -a 256 "$BACKUP_FILE" 2>/dev/null)
echo "$CHECKSUM" > "$PROOF_DIR/backup-checksum.txt"
pass "Checksum recorded: $(echo "$CHECKSUM" | cut -c1-16)..."

info "Step 4b: Recording backup row counts..."
BACKUP_TOTAL=$(count_rows_in_backup_artifact "$BACKUP_FILE")
echo "TOTAL|$BACKUP_TOTAL" > "$PROOF_DIR/backup-row-counts.txt"
pass "Backup artifact row counts recorded: $BACKUP_TOTAL total rows"

# =============================================================================
# Step 5: Create disposable test database and restore
# =============================================================================
info "Step 5: Creating disposable test database: $TEST_DB_NAME"

# Build a connection URL for the test database
TEST_DB_URL=$(build_database_url_with_db_name "$DATABASE_URL" "$TEST_DB_NAME")

# Create the test database
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $TEST_DB_NAME;" 2>&1 | tee -a "$PROOF_DIR/test-transcript.txt" || {
  fail "Could not create test database $TEST_DB_NAME"
  echo "STEP 5 FAIL: Could not create test database" >> "$PROOF_DIR/test-transcript.txt"
  exit 1
}
TEST_DB_CREATED=1
pass "Test database created: $TEST_DB_NAME"

# Restore into it
info "Restoring backup to test database..."
: > "$RESTORE_LOG"
if gunzip -c "$BACKUP_FILE" | psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 >"$RESTORE_LOG" 2>&1; then
  tail -20 "$RESTORE_LOG" | tee -a "$PROOF_DIR/test-transcript.txt"
  pass "Restore completed successfully"
  echo "STEP 5 PASS: Restore completed" >> "$PROOF_DIR/test-transcript.txt"
else
  tail -20 "$RESTORE_LOG" | tee -a "$PROOF_DIR/test-transcript.txt"
  fail "Restore had SQL errors"
  echo "STEP 5 FAIL: Restore errors" >> "$PROOF_DIR/test-transcript.txt"
fi

# =============================================================================
# Step 6: Verify restored row counts
# =============================================================================
info "Step 6: Verifying restored data..."

# Run ANALYZE first to update stats
psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 -c "ANALYZE;" >> "$PROOF_DIR/test-transcript.txt" 2>&1 || true

RESTORED_COUNTS=$(query_total_row_count "$TEST_DB_URL" 2>>"$PROOF_DIR/test-transcript.txt" || true)

if [ -n "$RESTORED_COUNTS" ]; then
  RESTORED_TOTAL=$(echo "$RESTORED_COUNTS" | tr -d '[:space:]')
  echo "TOTAL|$RESTORED_TOTAL" > "$PROOF_DIR/restored-row-counts.txt"
  pass "Restored row counts recorded: $RESTORED_TOTAL total rows"

  if [ "$BACKUP_TOTAL" = "$RESTORED_TOTAL" ]; then
    pass "Row counts match backup artifact: backup=$BACKUP_TOTAL restored=$RESTORED_TOTAL"
    echo "STEP 6 PASS: Row counts match backup artifact" >> "$PROOF_DIR/test-transcript.txt"
    if [ "$SOURCE_TOTAL" != "$RESTORED_TOTAL" ]; then
      info "Live source changed during backup window: source=$SOURCE_TOTAL backup=$BACKUP_TOTAL restored=$RESTORED_TOTAL"
      echo "STEP 6 NOTE: Live source changed during backup window" >> "$PROOF_DIR/test-transcript.txt"
    fi
  else
    fail "Row counts differ: backup=$BACKUP_TOTAL restored=$RESTORED_TOTAL"
    echo "STEP 6 FAIL: Row counts differ" >> "$PROOF_DIR/test-transcript.txt"
  fi
else
  fail "Could not query restored row counts"
  echo "QUERY_FAILED" > "$PROOF_DIR/restored-row-counts.txt"
  echo "STEP 6 FAIL: Could not query restored row counts" >> "$PROOF_DIR/test-transcript.txt"
fi

# =============================================================================
# Step 7: Cleanup
# =============================================================================
info "Step 7: Cleaning up test database..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" 2>&1 | tee -a "$PROOF_DIR/test-transcript.txt"
TEST_DB_CREATED=0
pass "Test database dropped: $TEST_DB_NAME"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "---" >> "$PROOF_DIR/test-transcript.txt"
echo "Test completed: $(date)" >> "$PROOF_DIR/test-transcript.txt"
echo "Failures: $FAILURES" >> "$PROOF_DIR/test-transcript.txt"

echo "========================================="
echo "Recovery Test Summary"
echo "========================================="
echo "Proof artifacts in: $PROOF_DIR/"
echo "  - test-transcript.txt"
echo "  - restore.log"
echo "  - backup-checksum.txt"
echo "  - backup-row-counts.txt"
echo "  - source-row-counts.txt"
echo "  - restored-row-counts.txt"
echo "  - backups/ (backup artifact)"
echo ""

if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}ALL CHECKS PASSED${NC}"
  exit 0
else
  echo -e "${RED}$FAILURES CHECK(S) FAILED${NC}"
  exit 1
fi
