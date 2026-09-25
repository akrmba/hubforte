#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Hubforte Backup Scheduler
# Installs (or updates) a daily 2am cron job for backup.sh.
# Safe to run multiple times — idempotent.
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup.sh"
CRON_TAG="# hubforte-daily-backup"
CRON_HOUR="2"
CRON_MINUTE="0"

if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "Error: backup.sh not found at ${BACKUP_SCRIPT}"
  exit 1
fi

chmod +x "$BACKUP_SCRIPT"

# Build the cron line — sources .env for DATABASE_URL
ENV_FILE="${SCRIPT_DIR}/../artifacts/api-server/.env"
if [ -f "$ENV_FILE" ]; then
  CRON_CMD="${CRON_MINUTE} ${CRON_HOUR} * * * . ${ENV_FILE} && ${BACKUP_SCRIPT} ${CRON_TAG}"
else
  CRON_CMD="${CRON_MINUTE} ${CRON_HOUR} * * * ${BACKUP_SCRIPT} ${CRON_TAG}"
  echo "Warning: .env not found at ${ENV_FILE}"
  echo "  The cron job will rely on DATABASE_URL being set in the environment."
fi

# Remove any existing hubforte backup cron entry, then add the new one
EXISTING_CRON=$(crontab -l 2>/dev/null || true)
FILTERED=$(echo "$EXISTING_CRON" | grep -v "$CRON_TAG" || true)

echo "$FILTERED" | { cat; echo "$CRON_CMD"; } | crontab -

echo ""
echo "Daily backup scheduled successfully."
echo ""
echo "  Schedule:  Every day at ${CRON_HOUR}:$(printf '%02d' ${CRON_MINUTE}) (server time)"
echo "  Script:    ${BACKUP_SCRIPT}"
echo "  Log file:  ${SCRIPT_DIR}/backups.log"
echo ""
echo "  To verify:  crontab -l | grep hubforte"
echo "  To remove:  crontab -l | grep -v hubforte-daily-backup | crontab -"
echo "  To run now: ${BACKUP_SCRIPT}"
echo ""
