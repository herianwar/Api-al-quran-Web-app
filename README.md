# 🕌 Al-Quran Super App API

API mandiri (self-hosted) untuk Al-Quran: surat, ayat, audio per qari, tafsir
Kemenag, doa & dzikir, jadwal sholat, autentikasi, dan fitur user (bookmark,
progres baca, hafalan dengan spaced-repetition).

Data awal di-_seed_ dari [equran.id](https://equran.id) (dan nomor halaman/juz
dari [Quran.com](https://quran.com)), lalu disimpan di PostgreSQL milik sendiri
sehingga **setelah seeding API berjalan 100% mandiri**.

## Tech stack

| Layer       | Teknologi                          |
| ----------- | ---------------------------------- |
| Runtime     | Node.js 20+                        |
| Framework   | NestJS 11 (TypeScript)             |
| ORM         | Prisma 6                           |
| Database    | PostgreSQL 16                      |
| Cache       | Redis 7 (graceful degradation)     |
| Auth        | JWT + refresh token (rotating)     |
| Realtime    | Socket.IO (progress seeding)       |
| Dokumentasi | Swagger / OpenAPI                  |
| Deploy      | Docker + Docker Compose            |

## Quick start (Docker)

```bash
cp .env.example .env          # sesuaikan secret bila perlu
docker compose up -d --build  # postgres + redis + app
```

Migrasi otomatis dijalankan saat container app start (`prisma migrate deploy`).

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/health`
- Seed monitor: `http://localhost:3000/seed-monitor.html`

## Local development

```bash
npm install
cp .env.example .env          # arahkan DATABASE_URL & REDIS ke instance lokal
npx prisma migrate dev        # buat schema
npm run start:dev             # http://localhost:3000
```

Butuh PostgreSQL + Redis berjalan. Cara cepat hanya untuk dependensi:

```bash
docker compose up -d postgres redis
```

## Seeding

1. Buka **`/seed-monitor.html`**, isi **Seed Admin Key** (env `SEED_ADMIN_KEY`).
2. Klik **Start Full Seed** — progress bar tiap job (surat, ayat, tafsir, doa)
   tampil realtime via WebSocket, lengkap dengan log & estimasi waktu.

Atau via API (semua butuh header `x-seed-admin-key`):

```bash
curl -X POST http://localhost:3000/api/v1/seed/start \
  -H "x-seed-admin-key: $SEED_ADMIN_KEY"

curl http://localhost:3000/api/v1/seed/status \
  -H "x-seed-admin-key: $SEED_ADMIN_KEY"
```

Seeding **idempotent** (pakai `upsert`) sehingga aman dijalankan ulang. Antar
request ke equran.id diberi jeda (`EQURAN_REQUEST_DELAY_MS`) agar tidak kena
rate limit. Nomor juz & halaman mushaf diisi dari Quran.com saat seeding ayat;
nonaktifkan dengan `QURAN_PAGE_ENABLED=false`.

## Ringkasan endpoint

Prefix: `/api/v1`. Format response: `{ success, message, data, meta? }`.

| Grup     | Endpoint |
| -------- | -------- |
| Quran    | `GET /quran/surat`, `/quran/surat/:nomor`, `/quran/surat/:nomor/ayat/:ayat`, `/quran/juz/:nomor`, `/quran/halaman/:nomor`, `/quran/random`, `/quran/search?q=&lang=` |
| Audio    | `GET /audio/surat/:nomor?qari=`, `/audio/ayat/:surat/:ayat?qari=`, `/audio/qari` |
| Tafsir   | `GET /tafsir/list`, `/tafsir/:surat`, `/tafsir/:surat/:ayat` |
| Doa      | `GET /doa`, `/doa/random`, `/doa/:id` |
| Sholat   | `GET /sholat/provinsi`, `/sholat/kota?provinsi=`, `/sholat/:kotaId?bulan=&tahun=`, `/sholat/:kotaId/hari-ini` |
| Auth     | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| User 🔒  | `GET/PUT /user/profile`, `GET/PUT /user/progress`, `GET/POST /user/bookmark`, `DELETE /user/bookmark/:id`, `GET/POST /user/hafalan`, `GET /user/hafalan/review`, `PUT /user/hafalan/:id/review` |
| Seed 🔑  | `POST /seed/start`, `POST /seed/start/:job`, `GET /seed/status`, `GET /seed/status/:job`, `DELETE /seed/reset` |

🔒 = butuh `Authorization: Bearer <accessToken>` · 🔑 = butuh `x-seed-admin-key`

Detail lengkap ada di Swagger `/api/docs`.

## Environment variables

Lihat [`.env.example`](./.env.example). Yang penting:

| Var | Keterangan |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Koneksi Redis (opsional; cache nonaktif kalau down) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Secret token (min. 32 char) |
| `SEED_ADMIN_KEY` | Kunci untuk endpoint seeding |
| `EQURAN_BASE_URL` / `EQURAN_REQUEST_DELAY_MS` | Sumber data utama & jeda request |
| `QURAN_PAGE_BASE_URL` / `QURAN_PAGE_ENABLED` | Sumber nomor halaman/juz |
| `CORS_ORIGIN`, `THROTTLE_TTL`, `THROTTLE_LIMIT` | CORS & rate limit |

## Testing

```bash
npm run test:e2e   # butuh PostgreSQL + Redis berjalan
```

## Catatan

- **Halaman & juz**: equran.id v2 tidak menyediakan metadata halaman mushaf,
  jadi nomor halaman (1–604) dan juz diambil dari Quran.com API v4 saat seeding
  dan disimpan di kolom `ayat.halaman` / `ayat.juz`. `GET /quran/juz` juga
  dihitung dari tabel batas juz bawaan sehingga tetap jalan tanpa Quran.com.
- **Jadwal sholat**: di-_fetch_ lazy per kota per bulan dari equran.id lalu
  disimpan di DB. Mapping field dibuat defensif (lihat `sholat.service.ts`);
  sesuaikan bila skema API berbeda.
- **Redis opsional**: bila Redis tidak tersedia, request tetap dilayani dari
  database (cache di-skip).

## Struktur project

```
src/
├── config/            # konfigurasi terpusat
├── prisma/            # PrismaService
├── redis/             # RedisService + cache keys/TTL
├── common/            # envelope, interceptor, filter, guard, equran client
├── modules/
│   ├── seed/          # seeding + WebSocket gateway
│   ├── quran/ audio/ tafsir/ doa/ sholat/
│   ├── auth/ user/
│   └── health/
└── main.ts
prisma/schema.prisma   # data model + migrations
public/seed-monitor.html
test/                  # e2e
```
