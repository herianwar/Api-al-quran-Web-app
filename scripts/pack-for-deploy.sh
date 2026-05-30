#!/usr/bin/env bash
# Bundle project untuk transfer ke VPS. Hasilnya ada di ../deploy-<timestamp>.tar.gz
# (di luar folder repo, biar tar tidak coba memasukkan diri sendiri).
#
# Yang DI-EXCLUDE:
#   - node_modules (akan di-install ulang via npm ci di VPS / docker build)
#   - .next, dist (akan di-build ulang di VPS)
#   - .git (cuma history, ga butuh runtime)
#   - audio-cache, snapshots (lokal — VPS punya volume sendiri)
#   - .env (PALING PENTING — jangan kirim secret dev ke VPS!)
#
# Yang DI-INCLUDE:
#   - source code (src/, prisma/, public/, data/, frontend/, scripts/)
#   - docker-compose.yml + docker-compose.prod.yml + Caddyfile
#   - .env.production.example (template, isi di VPS)
#   - DEPLOY.md, README.md
#   - Snapshot konten kalau ada (recommended — biar VPS tidak re-seed dari nol)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$(dirname "$REPO_DIR")"
TS=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$OUT_DIR/quran-app-deploy-$TS.tar.gz"

echo "📦 Packing dari: $REPO_DIR"
echo "📦 Output:       $OUT_FILE"
echo ""

# Cek apakah ada snapshot yang sudah di-export
if [[ -d "$REPO_DIR/snapshots-export" ]] && ls "$REPO_DIR/snapshots-export"/*.sql.gz >/dev/null 2>&1; then
  echo "✓ Snapshot konten ditemukan di snapshots-export/ — akan ikut di-bundle"
else
  echo "⚠ Belum ada snapshot konten di-export."
  echo "  Jalankan dulu (sambil container up) untuk hemat re-seed di VPS:"
  echo "    SEED_KEY=\$(grep SEED_ADMIN_KEY .env | cut -d= -f2)"
  echo "    curl -X POST :3000/api/v1/seed/snapshot/export -H \"x-seed-admin-key: \$SEED_KEY\""
  echo "    mkdir -p snapshots-export"
  echo "    docker compose cp app:/app/snapshots/. snapshots-export/"
  echo "  Lanjut tanpa snapshot? VPS harus re-seed dari nol (5-10 menit + traffic ke equran.id)."
  read -rp "  Lanjut tanpa snapshot? [y/N] " ans
  if [[ ! "$ans" =~ ^[Yy]$ ]]; then
    echo "Dibatalkan."
    exit 0
  fi
fi

cd "$REPO_DIR"

tar -czf "$OUT_FILE" \
  --exclude='./node_modules' \
  --exclude='**/node_modules' \
  --exclude='./.next' \
  --exclude='**/.next' \
  --exclude='./dist' \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./.env.local' \
  --exclude='./.env.bak' \
  --exclude='./frontend/.env.local' \
  --exclude='./audio-cache' \
  --exclude='./snapshots' \
  --exclude='**/coverage' \
  --exclude='**/.turbo' \
  --exclude='**/.cache' \
  --exclude='**/*.log' \
  --exclude='**/.DS_Store' \
  .

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo ""
echo "✅ Selesai: $OUT_FILE ($SIZE)"
echo ""
echo "Transfer ke VPS:"
echo "  scp $OUT_FILE user@vps:/srv/"
echo "  ssh user@vps"
echo "  cd /srv && tar -xzf $(basename "$OUT_FILE")"
echo ""
echo "Lalu ikuti DEPLOY.md di repo."
