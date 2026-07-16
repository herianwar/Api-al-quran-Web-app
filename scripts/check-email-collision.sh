#!/usr/bin/env bash
# Read-only: deteksi email yang tabrakan secara case-insensitive di tabel users
# (langkah A sebelum migrasi normalize_email_ci). Tidak menulis apa pun.
# Path tetap agar bisa di-allow-list sempit di .claude/settings.local.json.
set -euo pipefail
cd "$(dirname "$0")/.."
URL="$(grep -h '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/?schema=public//')"
psql "$URL" -v ON_ERROR_STOP=1 -c \
  "SELECT lower(email) AS email_ci, count(*) AS jml, array_agg(id) AS ids, array_agg(email) AS emails
   FROM users GROUP BY lower(email) HAVING count(*) > 1 ORDER BY jml DESC;"
