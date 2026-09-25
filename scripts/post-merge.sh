#!/bin/bash
set -e
pnpm install --frozen-lockfile
# NOTE: drizzle-kit push is blocked. Schema changes use SQL migration files.
# See docs/SCHEMA_SOURCE_OF_TRUTH.md for the migration workflow.
# Migrations must be applied manually: psql $DATABASE_URL -f lib/db/migrations/XXXX_up.sql
