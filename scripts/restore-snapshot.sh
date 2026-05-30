#!/usr/bin/env bash
# Restore a content snapshot (.sql.gz) into the configured Postgres database.
#
# Usage:
#   ./scripts/restore-snapshot.sh path/to/quran-content-YYYYMMDDHHMMSS.sql.gz
#
# Requires: DATABASE_URL env var (e.g. via .env), gunzip + psql in PATH.
# IMPORTANT: run `prisma migrate deploy` first so the schema exists.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <snapshot.sql.gz>" >&2
  exit 2
fi

SNAPSHOT_FILE="$1"

if [[ ! -f "$SNAPSHOT_FILE" ]]; then
  echo "Error: file not found: $SNAPSHOT_FILE" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  # Try to source .env in the repo root.
  if [[ -f "$(dirname "$0")/../.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    source "$(dirname "$0")/../.env"
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is not set" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql not found in PATH" >&2
  exit 1
fi
if ! command -v gunzip >/dev/null 2>&1; then
  echo "Error: gunzip not found in PATH" >&2
  exit 1
fi

echo "Restoring $SNAPSHOT_FILE → DATABASE_URL"
gunzip -c "$SNAPSHOT_FILE" | psql -v ON_ERROR_STOP=1 --quiet "$DATABASE_URL"
echo "Done."
