#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Hubforte Database Backup
# Supports local and S3-compatible destinations, rotation,
# logging, and SUPER_ADMIN notification.
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/postgres-tools.sh
source "${SCRIPT_DIR}/lib/postgres-tools.sh"
# shellcheck source=./lib/database-url.sh
source "${SCRIPT_DIR}/lib/database-url.sh"
LOG_FILE="${SCRIPT_DIR}/backups.log"
MAX_BACKUPS=30
DEST=""

ensure_postgres_tools_on_path

# ── Parse flags ──────────────────────────────────────────────
usage() {
  echo "Usage: $0 [--dest <local-path|s3://bucket/prefix>]"
  echo ""
  echo "  --dest   Backup destination (default: ./backups)"
  echo "           Accepts a local directory or an S3-compatible URL."
  echo ""
  echo "  Environment:"
  echo "    DATABASE_URL   Required. PostgreSQL connection string."
  echo "    BACKUP_DEST    Fallback if --dest is not provided."
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest)
      DEST="$2"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
done

# ── Resolve destination ─────────────────────────────────────
if [ -z "$DEST" ]; then
  DEST="${BACKUP_DEST:-${SCRIPT_DIR}/backups}"
fi

IS_S3=false
if [[ "$DEST" == s3://* ]]; then
  IS_S3=true
fi

# ── Validate DATABASE_URL ───────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  MSG="Backup failed: DATABASE_URL is not set"
  echo "$MSG"
  echo "$(date -Iseconds) FAIL $MSG" >> "$LOG_FILE"
  exit 1
fi

# ── Parse DATABASE_URL ──────────────────────────────────────
parse_database_url "${DATABASE_URL}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="hubforte_backup_${TIMESTAMP}.sql.gz"

export PGPASSWORD="${DB_PASS}"

log() {
  local status="$1"
  local msg="$2"
  echo "$(date -Iseconds) ${status} ${msg}" >> "$LOG_FILE"
  echo "${msg}"
}

# ── Notify SUPER_ADMIN via DB ────────────────────────────────
notify_superadmin() {
  local level="$1"   # INFO or ERROR
  local message="$2"
  # Insert a notification row directly — uses the error_logs table
  # as a lightweight notification channel for SUPER_ADMIN users.
  psql "$DATABASE_URL" -q -c "
    INSERT INTO error_logs (id, level, message, source, plain_english, created_at)
    VALUES (
      'bkp_${TIMESTAMP}',
      '${level}',
      '$(echo "$message" | sed "s/'/''/g")',
      'backup',
      '$(echo "$message" | sed "s/'/''/g")',
      NOW()
    );
  " 2>/dev/null || true
}

# ── Run pg_dump ─────────────────────────────────────────────
log "START" "Backing up '${DB_NAME}' on ${DB_HOST}:${DB_PORT} → ${DEST}/${FILENAME}"

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

if ! pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -F plain --no-owner --no-privileges | gzip > "$TMPFILE"; then
  log "FAIL" "pg_dump failed for ${DB_NAME}"
  notify_superadmin "ERROR" "Backup FAILED for database ${DB_NAME} at $(date -Iseconds)"
  exit 1
fi

FILESIZE=$(stat -c%s "$TMPFILE" 2>/dev/null || stat -f%z "$TMPFILE" 2>/dev/null || echo "unknown")

# ── Store backup ────────────────────────────────────────────
if $IS_S3; then
  # S3 upload via aws CLI
  if ! command -v aws &>/dev/null; then
    log "FAIL" "aws CLI not found — cannot upload to S3"
    notify_superadmin "ERROR" "Backup FAILED: aws CLI not installed, cannot upload to ${DEST}"
    exit 1
  fi

  if aws s3 cp "$TMPFILE" "${DEST}/${FILENAME}"; then
    log "OK" "Uploaded to ${DEST}/${FILENAME} (${FILESIZE} bytes)"
  else
    log "FAIL" "S3 upload failed to ${DEST}/${FILENAME}"
    notify_superadmin "ERROR" "Backup FAILED: S3 upload to ${DEST}/${FILENAME}"
    exit 1
  fi
else
  # Local destination
  mkdir -p "$DEST"
  mv "$TMPFILE" "${DEST}/${FILENAME}"

  log "OK" "Saved ${DEST}/${FILENAME} (${FILESIZE} bytes)"

  # ── Rotation: keep only last N backups ──────────────────
  BACKUP_COUNT=$(ls -1 "${DEST}"/hubforte_backup_*.sql.gz 2>/dev/null | wc -l)
  if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    ls -1t "${DEST}"/hubforte_backup_*.sql.gz | tail -n "$REMOVE_COUNT" | while read -r OLD; do
      rm -f "$OLD"
      log "ROTATE" "Deleted old backup: $(basename "$OLD")"
    done
  fi
fi

# ── Notify success ──────────────────────────────────────────
notify_superadmin "INFO" "Backup completed: ${FILENAME} (${FILESIZE} bytes)"

log "DONE" "Backup complete: ${FILENAME}"
exit 0
