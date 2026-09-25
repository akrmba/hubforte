#!/usr/bin/env bash

ensure_postgres_tools_on_path() {
  if command -v pg_dump >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
    return 0
  fi

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [ -x "$script_dir/pg_dump" ] && [ -x "$script_dir/psql" ]; then
    export PATH="$script_dir:$PATH"
  fi

  if command -v pg_dump >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
    return 0
  fi

  echo "Error: pg_dump and psql must be available on PATH" >&2
  return 1
}
