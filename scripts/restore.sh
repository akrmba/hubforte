#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Hubforte Database Restore
# Lists available backups, requires explicit confirmation,
# optionally test-restores to a temporary database first.
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/postgres-tools.sh
source "${SCRIPT_DIR}/lib/postgres-tools.sh"
# shellcheck source=./lib/database-url.sh
source "${SCRIPT_DIR}/lib/database-url.sh"
DEFAULT_BACKUP_DIR="${BACKUP_DEST:-${SCRIPT_DIR}/backups}"

ensure_postgres_tools_on_path

usage() {
  echo "Usage:"
  echo "  $0 --list [--dir <path>]              List available backups"
  echo "  $0 <backup-file.sql.gz> [--test]      Restore a backup"
  echo ""
  echo "Options:"
  echo "  --list       List available backups in the backup directory"
  echo "  --dir <path> Backup directory (default: ${DEFAULT_BACKUP_DIR})"
  echo "  --test       Test restore to a temporary database first,"
  echo "               then swap it into place"
  echo ""
  echo "Environment:"
  echo "  DATABASE_URL   Required. PostgreSQL connection string."
  echo "  BACKUP_DEST    Default backup directory if --dir not specified."
  exit 1
}

# ── Parse arguments ─────────────────────────────────────────
BACKUP_FILE=""
BACKUP_DIR="$DEFAULT_BACKUP_DIR"
LIST_MODE=false
TEST_MODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list)
      LIST_MODE=true
      shift
      ;;
    --dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --test)
      TEST_MODE=true
      shift
      ;;
    --help|-h)
      usage
      ;;
    *)
      if [ -z "$BACKUP_FILE" ]; then
        BACKUP_FILE="$1"
      else
        echo "Unknown argument: $1"
        usage
      fi
      shift
      ;;
  esac
done

# ── List mode ───────────────────────────────────────────────
if $LIST_MODE; then
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "No backup directory found at: ${BACKUP_DIR}"
    exit 1
  fi

  BACKUPS=$(ls -1t "${BACKUP_DIR}"/hubforte_backup_*.sql.gz 2>/dev/null || true)
  if [ -z "$BACKUPS" ]; then
    echo "No backups found in ${BACKUP_DIR}"
    exit 0
  fi

  echo ""
  echo "Available backups in ${BACKUP_DIR}:"
  echo "─────────────────────────────────────────────────────"
  printf "%-4s  %-42s  %s\n" "#" "Filename" "Size"
  echo "─────────────────────────────────────────────────────"

  INDEX=1
  echo "$BACKUPS" | while read -r FILE; do
    FNAME=$(basename "$FILE")
    FSIZE=$(ls -lh "$FILE" | awk '{print $5}')
    printf "%-4s  %-42s  %s\n" "$INDEX" "$FNAME" "$FSIZE"
    INDEX=$((INDEX + 1))
  done

  echo ""
  echo "To restore: $0 ${BACKUP_DIR}/<filename>"
  exit 0
fi

# ── Validate inputs ────────────────────────────────────────
if [ -z "$BACKUP_FILE" ]; then
  usage
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file not found: ${BACKUP_FILE}"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set"
  exit 1
fi

# ── Parse DATABASE_URL ──────────────────────────────────────
parse_database_url "${DATABASE_URL}"

export PGPASSWORD="${DB_PASS}"

# ── Confirmation ────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              DATABASE RESTORE WARNING                ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Database:  ${DB_NAME}"
echo "║  Host:      ${DB_HOST}:${DB_PORT}"
echo "║  Backup:    $(basename "$BACKUP_FILE")"
if $TEST_MODE; then
  echo "║  Mode:      TEST (restore to temp DB, then swap)"
else
  echo "║  Mode:      DIRECT (overwrites current database)"
fi
echo "╚══════════════════════════════════════════════════════╝"
echo ""

read -rp "Type the database name to confirm (${DB_NAME}): " CONFIRM
if [ "$CONFIRM" != "$DB_NAME" ]; then
  echo "Confirmation failed. Aborting."
  exit 1
fi

# ── Test restore mode ───────────────────────────────────────
if $TEST_MODE; then
  TEMP_DB="${DB_NAME}_restore_test_$$"
  echo ""
  echo "Step 1/3: Creating temporary database '${TEMP_DB}'..."

  if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE \"${TEMP_DB}\";" 2>/dev/null; then
    echo "Error: Failed to create temporary database"
    exit 1
  fi

  echo "Step 2/3: Test-restoring to '${TEMP_DB}'..."
  if gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEMP_DB" -q 2>/dev/null; then
    echo "  Test restore succeeded."
  else
    echo "  Test restore FAILED. Cleaning up temp database..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" 2>/dev/null || true
    echo "  Aborted. Original database is untouched."
    exit 1
  fi

  echo "Step 3/3: Swapping databases..."

  # Terminate connections to the target DB
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
  " 2>/dev/null || true

  # Rename: target → old, temp → target
  OLD_DB="${DB_NAME}_pre_restore_$$"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "ALTER DATABASE \"${DB_NAME}\" RENAME TO \"${OLD_DB}\";" 2>/dev/null
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "ALTER DATABASE \"${TEMP_DB}\" RENAME TO \"${DB_NAME}\";" 2>/dev/null

  echo ""
  echo "Restore complete (test mode)."
  echo "  Old database preserved as: ${OLD_DB}"
  echo "  To remove old database: psql -c 'DROP DATABASE \"${OLD_DB}\";'"
  exit 0
fi

# ── Direct restore ──────────────────────────────────────────
echo ""
echo "Restoring from $(basename "$BACKUP_FILE")..."

if gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q; then
  echo ""
  echo "Restore complete."
else
  echo ""
  echo "Restore failed."
  exit 1
fi
