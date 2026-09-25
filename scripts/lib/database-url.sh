#!/usr/bin/env bash

parse_database_url() {
  local db_url="$1"

  DB_URL="$db_url"
  DB_USER=$(printf '%s' "$db_url" | sed -E 's|.*://([^:@]+)(:[^@]+)?@.*|\1|')
  DB_PASS=$(printf '%s' "$db_url" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
  DB_HOST=$(printf '%s' "$db_url" | sed -E 's|.*@([^:/]+)[:/].*|\1|')
  DB_PORT=$(printf '%s' "$db_url" | sed -nE 's|.*@[^:/]+:([0-9]+)/.*|\1|p')
  DB_PORT=${DB_PORT:-5432}
  DB_NAME=$(printf '%s' "$db_url" | sed -E 's|.*/([^?]+).*|\1|')
}

build_database_url_with_db_name() {
  python - "$1" "$2" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit

url = sys.argv[1]
db_name = sys.argv[2]
parts = urlsplit(url)
print(urlunsplit((parts.scheme, parts.netloc, f"/{db_name}", parts.query, parts.fragment)))
PY
}
