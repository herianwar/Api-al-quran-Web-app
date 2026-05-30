# Deploy ke VPS

Panduan deploy Al-Qur'an Super App ke VPS (Ubuntu/Debian).

## Prasyarat

- VPS Linux dengan minimal **2 GB RAM** (4 GB lebih nyaman kalau warm audio cache)
- Storage minimal **5 GB** (10 GB kalau full audio cache)
- Domain yang sudah pointing ke IP VPS (A record), 2 subdomain rekomendasi:
  - `quran.yourdomain.com` → frontend
  - `api.yourdomain.com` → backend
- Akses SSH ke VPS

## Step 1 — Siapkan VPS (sekali saja)

SSH ke VPS, lalu install Docker:

```bash
# Update + install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER  # logout-login dulu setelah ini
```

Verifikasi: `docker --version && docker compose version`

## Step 2 — Di mesin lokal: export snapshot konten

**Penting** — supaya VPS tidak perlu re-seed dari nol (5-10 menit + traffic ke equran.id).

```bash
# Pastikan app container masih running dengan data lengkap
docker compose ps app

# Generate snapshot terbaru
SEED_KEY=$(grep ^SEED_ADMIN_KEY= .env | cut -d= -f2)
curl -X POST http://localhost:3000/api/v1/seed/snapshot/export \
  -H "x-seed-admin-key: $SEED_KEY"

# Copy semua snapshot dari volume Docker ke folder lokal
mkdir -p snapshots-export
docker compose cp app:/app/snapshots/. snapshots-export/

ls -lh snapshots-export/
# Harus muncul satu/lebih file .sql.gz (~5-6 MB)
```

## Step 3 — Pack project

```bash
# Jalankan dari repo root
./scripts/pack-for-deploy.sh
```

Hasil: `../quran-app-deploy-YYYYMMDD-HHMMSS.tar.gz` (~5-10 MB, tanpa
node_modules / .next / dev secrets).

## Step 4 — Transfer ke VPS

```bash
# Dari mesin lokal
scp ../quran-app-deploy-*.tar.gz user@vps:/srv/

ssh user@vps
sudo mkdir -p /srv/quran && sudo chown $USER:$USER /srv/quran
cd /srv/quran
tar -xzf /srv/quran-app-deploy-*.tar.gz
```

## Step 5 — Setup `.env` production

```bash
cd /srv/quran
cp .env.production.example .env

# Generate secrets baru — paste output ke .env
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('SEED_ADMIN_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# Atau pakai openssl kalau node belum ke-install:
openssl rand -hex 48  # untuk JWT_SECRET dan JWT_REFRESH_SECRET
openssl rand -hex 32  # untuk SEED_ADMIN_KEY

nano .env  # paste secret + set DATABASE password, CORS_ORIGIN, dll
```

**Wajib di-edit**:

- `JWT_SECRET` (random hex 48 byte)
- `JWT_REFRESH_SECRET` (random hex 48 byte, **harus beda dari JWT_SECRET**)
- `SEED_ADMIN_KEY` (random hex 32 byte)
- `DATABASE_URL` — ganti password `quranpass` jadi yang kuat
- `CORS_ORIGIN` — set ke `https://quran.yourdomain.com`
- `ADMIN_BOOTSTRAP_EMAIL` — email Anda (akan otomatis di-promote ke admin)

> Backend akan refuse-to-boot kalau JWT_SECRET / SEED_ADMIN_KEY masih
> placeholder `change-me-*` atau panjangnya < 32 char.

## Step 6 — Setup Caddyfile

```bash
nano Caddyfile
```

Ganti `quran.yourdomain.com` dan `api.yourdomain.com` dengan domain Anda yang
sudah pointing ke VPS. Caddy otomatis fetch SSL Let's Encrypt 60 detik setelah
container up.

## Step 7 — Build images + first up

```bash
# Build (di VPS, butuh 5-10 menit)
# NEXT_PUBLIC_API_URL akan di-baked ke client bundle, pastikan benar
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1 \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Up semua (Postgres + Redis + App + Web + Caddy)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Cek log app sampai boot selesai
docker compose logs app -f
# Cari "Nest application successfully started"
# Kalau muncul "Refusing to boot in production with weak/default secrets" → fix .env
```

## Step 8 — Restore snapshot konten (skip re-seed)

```bash
# Copy snapshot ke volume
docker compose cp snapshots-export/. app:/app/snapshots/

# Restore via API
SEED_KEY=$(grep ^SEED_ADMIN_KEY= .env | cut -d= -f2)
# Ganti nama file sesuai snapshot Anda
SNAPSHOT_FILE=$(ls snapshots-export/*.sql.gz | head -1 | xargs basename)

curl -X POST http://localhost:3000/api/v1/seed/snapshot/import \
  -H "x-seed-admin-key: $SEED_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"$SNAPSHOT_FILE\"}"

# Verifikasi data masuk
docker compose exec postgres psql -U quranuser -d quran_db -c \
  "SELECT 'ayat' tbl, count(*) FROM ayat UNION ALL SELECT 'doa', count(*) FROM doa;"
# Harus tampil: ayat 6236, doa 50
```

## Step 9 — Promote akun ke admin

```bash
# Daftar lewat frontend (https://quran.yourdomain.com/register) dengan email
# yang sudah Anda set di ADMIN_BOOTSTRAP_EMAIL

# Lalu restart app — promotion happen at startup
docker compose restart app

# Atau manual via DB:
docker compose exec postgres psql -U quranuser -d quran_db -c \
  "UPDATE users SET role='admin' WHERE email='email-anda@gmail.com';"
```

## Step 10 — Verifikasi

```bash
# Backend
curl https://api.yourdomain.com/health
# Expected: {"success":true,"message":"OK",...}

# Frontend
curl -I https://quran.yourdomain.com/
# Expected: HTTP/2 200

# Login admin via UI → klik link "Admin" di Navbar → akses /admin
```

## Setelah live

### Update aplikasi

```bash
# Di mesin lokal: build update + zip
./scripts/pack-for-deploy.sh
scp ../quran-app-deploy-*.tar.gz user@vps:/srv/

# Di VPS
ssh user@vps
cd /srv/quran
tar -xzf /srv/quran-app-deploy-XYZ.tar.gz  # overwrite source
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1 \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build app web
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app web
```

Database **tidak terganggu** (volume `postgres_data` persistent).

### Backup otomatis

Tambahkan ke crontab VPS:

```bash
crontab -e
```

```cron
# Snapshot harian jam 03:00
0 3 * * * cd /srv/quran && curl -s -X POST http://localhost:3000/api/v1/seed/snapshot/export -H "x-seed-admin-key: $(grep ^SEED_ADMIN_KEY= .env | cut -d= -f2)" > /dev/null
```

Atau pakai `pg_dump` langsung untuk backup penuh termasuk user data:

```cron
# Backup full DB harian
0 3 * * * docker compose -f /srv/quran/docker-compose.yml exec -T postgres pg_dump -U quranuser quran_db | gzip > /srv/backups/db-$(date +\%Y\%m\%d).sql.gz
```

### Warm audio cache (opsional, ~30-60 menit, ~2 GB)

```bash
SEED_KEY=$(grep ^SEED_ADMIN_KEY= .env | cut -d= -f2)
curl -X POST http://localhost:3000/api/v1/seed/start/audio \
  -H "x-seed-admin-key: $SEED_KEY"

# Monitor di admin panel: https://quran.yourdomain.com/admin/seed
```

### Push notification (opsional)

1. Generate service account JSON di Firebase Console
2. Upload ke VPS: `scp firebase-key.json user@vps:/srv/quran/secrets/firebase.json`
3. Tambah ke `.env`: `FCM_SERVICE_ACCOUNT_PATH=/app/secrets/firebase.json`
4. Mount di docker-compose:
   ```yaml
   services:
     app:
       volumes:
         - ./secrets:/app/secrets:ro
   ```
5. Restart: `docker compose restart app`

## Troubleshooting

| Gejala | Solusi |
| --- | --- |
| `app` restart-loop dengan "Refusing to boot in production with weak/default secrets" | Generate ulang JWT_SECRET dll, pastikan ≥32 char dan tidak prefix `change-me` |
| Frontend 502 Bad Gateway | Cek `docker compose ps` — `web` healthy? Cek log: `docker compose logs web` |
| HTTPS cert tidak muncul | Domain belum point ke IP VPS, atau port 80/443 tidak open di firewall. Coba `curl -I http://yourdomain.com` |
| Audio tidak play | Cache kosong → trigger `/seed/start/audio` (lama) atau biarkan lazy-cache (otomatis saat user pertama play) |
| Push notification no-op | `FCM_SERVICE_ACCOUNT_PATH` tidak set / file tidak ada. Lihat log: `FCM_SERVICE_ACCOUNT_PATH not set — push notifications disabled` |
| Lupa SEED_ADMIN_KEY | Cek di .env: `grep SEED_ADMIN_KEY .env` |

## Spesifikasi minimum VPS

| RAM | Audio cache warm | Catatan |
| --- | --- | --- |
| 1 GB | ❌ tidak muat | Postgres + Redis + Node sudah ~700 MB |
| 2 GB | ⚠ marginal | OK tanpa audio warm; pakai swap kalau warm |
| 4 GB | ✅ nyaman | Recommended untuk production |

Disk:

- App + DB: ~500 MB
- Audio cache (warm): ~2 GB
- Snapshots: ~10 MB per snapshot
- DB user data: tumbuh ~1 MB per 1000 user

**Rekomendasi VPS Indonesia**:

- Biznet Gio, Niagahoster, IDCloudHost: starting Rp 80k/bulan
- Vultr (Singapore): $6/bulan (~95k)
- Hetzner Cloud (Falkenstein, jauh tapi murah): €4.5/bulan

Pilih yang punya snapshot/backup otomatis biar gampang rollback kalau apa-apa.
