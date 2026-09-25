#!/usr/bin/env bash
# Post-deploy health check script for Hubforte
# Usage: ./scripts/post-deploy-check.sh [BASE_URL] [SUPER_ADMIN_TOKEN]
# Default BASE_URL: http://localhost:3000
# SUPER_ADMIN_TOKEN: optional — if provided, tests authenticated endpoints

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
SUPER_ADMIN_TOKEN="${2:-}"
PASS=0
FAIL=0
WARN=0
ALERTS=""

log_pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
log_warn() { echo "  WARN  $1"; WARN=$((WARN + 1)); ALERTS="${ALERTS}\n  - WARN: $1"; }
log_fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); ALERTS="${ALERTS}\n  - FAIL: $1"; }

echo ""
echo "=== Hubforte Post-Deploy Health Check ==="
echo "Target: $BASE_URL"
echo "Time:   $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# --- Step 1: Basic health check ---
echo "--- Core Health ---"
HTTP_CODE=$(curl -s -o /tmp/healthz.json -w "%{http_code}" --max-time 10 "$BASE_URL/api/healthz" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  log_pass "Health endpoint (HTTP 200)"
  DB_STATUS=$(cat /tmp/healthz.json | grep -o '"db":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$DB_STATUS" = "connected" ]; then
    log_pass "Database connected"
  else
    log_fail "Database NOT connected (status: ${DB_STATUS:-unknown})"
  fi
else
  log_fail "Health endpoint unreachable (HTTP $HTTP_CODE)"
fi

# --- Step 2: Detailed health check ---
echo ""
echo "--- Detailed Health ---"
HTTP_CODE=$(curl -s -o /tmp/health_detailed.json -w "%{http_code}" --max-time 15 "$BASE_URL/api/health/detailed" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  log_pass "Detailed health endpoint reachable"
  OVERALL=$(cat /tmp/health_detailed.json | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$OVERALL" = "healthy" ]; then
    log_pass "Overall status: healthy"
  elif [ "$OVERALL" = "degraded" ]; then
    log_warn "Overall status: degraded"
  else
    log_fail "Overall status: $OVERALL"
  fi
else
  log_fail "Detailed health endpoint unreachable (HTTP $HTTP_CODE)"
fi

# --- Step 3: Authenticated dashboard stats (if token provided) ---
if [ -n "$SUPER_ADMIN_TOKEN" ]; then
  echo ""
  echo "--- Authenticated Checks ---"
  HTTP_CODE=$(curl -s -o /tmp/dashboard.json -w "%{http_code}" --max-time 15 \
    -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
    -H "X-Requested-With: XMLHttpRequest" \
    "$BASE_URL/api/dashboard/stats" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    log_pass "Authenticated dashboard request (SUPER_ADMIN token)"
  else
    log_fail "Authenticated dashboard request failed (HTTP $HTTP_CODE)"
  fi
else
  echo ""
  echo "--- Authenticated Checks ---"
  log_warn "No SUPER_ADMIN_TOKEN provided — skipping authenticated checks"
  log_warn "Usage: ./scripts/post-deploy-check.sh <URL> <TOKEN>"
fi

# --- Step 4: Login page reachable ---
echo ""
echo "--- Auth ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/api/auth/login" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "200" ]; then
  log_pass "Login page reachable (HTTP $HTTP_CODE)"
else
  log_fail "Login page unreachable (HTTP $HTTP_CODE)"
fi

# --- Step 5: Public routes ---
echo ""
echo "--- Public Routes ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"post-deploy-check","stack":"synthetic","route":"/"}' \
  "$BASE_URL/api/log-client-error" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "400" ]; then
  log_pass "Log client error endpoint (HTTP $HTTP_CODE)"
else
  log_fail "Log client error endpoint unreachable (HTTP $HTTP_CODE)"
fi

# --- Summary ---
echo ""
echo "--- Summary ---"
TOTAL=$((PASS + FAIL + WARN))
echo "  Total: $TOTAL  Pass: $PASS  Fail: $FAIL  Warn: $WARN"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  RESULT: DEPLOY_FAILED"
  echo ""
  echo "  ALERTS:"
  echo -e "$ALERTS"
  echo ""
  echo "  ACTION: Do NOT disable maintenance mode."
  echo "          Follow ops/ROLLBACK_RUNBOOK.md immediately."

  # If a SUPER_ADMIN token is provided, report the failure to the API
  # This triggers auto-detection: error log, admin notification, maintenance re-enable
  if [ -n "$SUPER_ADMIN_TOKEN" ]; then
    echo ""
    echo "  Reporting deploy failure to API..."
    # Build JSON array of alerts
    ALERT_JSON=$(echo -e "$ALERTS" | sed 's/^  - //' | grep -v '^$' | while read -r line; do printf '"%s",' "$line"; done | sed 's/,$//')
    curl -s -X POST "$BASE_URL/api/super-admin/deploy/report-failure" \
      -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -H "X-Requested-With: XMLHttpRequest" \
      -d "{\"checks\":[$ALERT_JSON]}" 2>/dev/null || true
    echo "  Failure reported."
  fi

  exit 1
else
  echo "  RESULT: DEPLOY_SUCCESS"
  if [ "$WARN" -gt 0 ]; then
    echo ""
    echo "  WARNINGS (non-blocking):"
    echo -e "$ALERTS"
  fi
  exit 0
fi
