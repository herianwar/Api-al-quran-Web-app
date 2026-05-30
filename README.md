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

> **Catatan**: secara default `docker-compose.yml` mem-publish Postgres ke
> port host `55432` dan Redis ke `56379` agar tidak bentrok kalau Anda
> sudah punya Postgres/Redis lokal. Container lain (app, dll) tetap
> terhubung lewat network internal Docker di port standar.

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/health`
- Seed monitor: `http://localhost:3000/seed-monitor.html`

> **Produksi**: aplikasi akan **menolak boot** bila `JWT_SECRET`,
> `JWT_REFRESH_SECRET`, atau `SEED_ADMIN_KEY` masih berisi nilai default
> `change-me-*` atau panjangnya kurang dari 32 karakter saat
> `NODE_ENV=production`. Ganti dengan nilai random yang panjang sebelum
> deploy.

## Local development

Butuh PostgreSQL + Redis berjalan. Cara tercepat: pakai Docker hanya untuk
dependensi:

```bash
docker compose up -d postgres redis
```

Lalu jalankan app dari host:

```bash
npm install
cp .env.example .env          # arahkan DATABASE_URL & REDIS ke instance lokal
# Catatan: kalau pakai docker-compose untuk dependensi, port host =
# 55432 (postgres) & 56379 (redis). Sesuaikan DATABASE_URL/REDIS_PORT.
npx prisma migrate dev        # buat schema
npm run start:dev             # http://localhost:3000
```

## Frontend (web app)

A modern **Next.js 16 + React 19 + Tailwind v4** client lives in
[`frontend/`](./frontend). Features: daftar & baca surat, murottal per qari,
tafsir per ayat, pencarian ayat, doa, jadwal sholat, serta login + bookmark
dan hafalan (spaced-repetition) yang terhubung ke API ini.

```bash
cd frontend
npm install
cp .env.example .env.local     # set NEXT_PUBLIC_API_URL ke backend (mis. http://localhost:3000/api/v1)
npm run dev -- -p 3001         # http://localhost:3001
```

Pastikan backend berjalan dan sudah di-seed agar data tampil. Backend sudah
meng-_allow_ CORS (atur `CORS_ORIGIN` di backend bila perlu membatasi origin).

## Seeding

1. Buka **`/seed-monitor.html`**, isi **Seed Admin Key** (env `SEED_ADMIN_KEY`).
2. Klik **Start Full Seed** — progress bar tiap job (surat, ayat, tafsir, doa,
   kota) tampil realtime via WebSocket, lengkap dengan log & estimasi waktu.

Atau via API (semua butuh header `x-seed-admin-key`):

```bash
curl -X POST http://localhost:3000/api/v1/seed/start \
  -H "x-seed-admin-key: $SEED_ADMIN_KEY"

curl http://localhost:3000/api/v1/seed/status \
  -H "x-seed-admin-key: $SEED_ADMIN_KEY"
```

Job yang tersedia (Core + Konten + Audio):

| Job | Sumber | Durasi | Catatan |
| --- | --- | --- | --- |
| `surah` | equran.id | <1 mnt | Metadata 114 surat |
| `ayat` | equran.id + quran.com | ~5 mnt | 6.236 ayat + audio URLs + halaman/juz |
| `tafsir` | equran.id | ~3 mnt | Tafsir Kemenag |
| `doa` | equran.id (+ fallback statis) | <1 mnt | 50 doa esensial minimal |
| `kota` | myquran.com | <1 mnt | Master kota untuk jadwal sholat |
| `translation` | quran.com | ~5 mnt | Sahih International, Pickthall, Kemenag 2019 (~18k row) |
| `asbabun_nuzul` | curated JSON | <1 mnt | 93 entry |
| `topic` | curated JSON | <1 mnt | 20 topik tematik |
| `tafsir_extra` | quran.com | ~10 mnt | Ibn Kathir AR/EN + Muyassar |
| `jadwal_sholat` | myquran.com | 30-60 mnt | Pre-fetch semua kota × 12 bulan (idempotent) |
| `hadith` | renomureza/hadis-api-id | 5-15 mnt | ~38.000 hadis 9 perawi |
| `asmaul_husna` | bundled JSON | <1 detik | 99 nama |
| **`ayat_kata`** | **api.quran.com (id)** | **~6 mnt** | **Kata-perkata 6.236 ayat (~77k row) — atomic per-ayat replace** |
| `sajdah` | bundled JSON | <1 detik | 15 ayat sajdah, di-tag jenis (wajibah/mukhtalaf) |
| `niat_shalat` | bundled JSON | <1 detik | 5 niat shalat fardhu |
| `bacaan_shalat` | bundled JSON | <1 detik | 10 gerakan, 31 bacaan |
| `tahlil` | bundled JSON | <1 detik | 44 entry urutan tahlil |
| `embeddings` | OpenAI API | ~5 mnt | Embed 6.236 ayat untuk AI semantic search (~$0.01 sekali) |
| `audio` | equran CDN | 1-3 jam | Pre-download semua MP3 (~18 GB) |

`startAll` menjalankan **Core + Konten dasar** secara berurutan (8 job pertama).
`audio`, `tafsir_extra`, `jadwal_sholat`, `hadith`, `asmaul_husna`, dan
`ayat_kata` sengaja **diisolasi** karena durasinya panjang atau perlu
dijalankan kondisional — trigger manual via `POST /seed/start/:job`.

Seeding **idempotent** (pakai `upsert`) sehingga aman dijalankan ulang. Antar
request ke equran.id diberi jeda (`EQURAN_REQUEST_DELAY_MS`) agar tidak kena
rate limit. Nomor juz & halaman mushaf diisi dari Quran.com saat seeding ayat;
nonaktifkan dengan `QURAN_PAGE_ENABLED=false`.

Jika `/doa` di equran.id sedang down saat seeding, fallback ke file statis
[`data/doa-fallback.json`](./data/doa-fallback.json) (50 doa esensial) sehingga
endpoint `/doa` **tidak pernah kosong**.

## AI semantic search (`/quran/ask` & `/tanya`)

Memungkinkan pencarian natural-language: user ketik "ayat tentang keluarga",
sistem ranking ayat berdasar kesamaan **makna**, bukan exact-string. Stack:
**pgvector** (Postgres) + **OpenAI embeddings** (default `text-embedding-3-small`,
1536 dim). Provider dapat di-swap ke Gemini/local nanti — interface
provider-agnostic di `AiService`.

**One-time setup:**

```bash
# 1. Install pgvector (Ubuntu pgdg repo, sekali per server)
echo "deb [signed-by=/etc/apt/keyrings/postgresql.asc] http://apt.postgresql.org/pub/repos/apt jammy-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | sudo tee /etc/apt/keyrings/postgresql.asc > /dev/null
sudo apt-get update && sudo apt-get install -y postgresql-14-pgvector

# 2. Enable extension (sebagai superuser, sekali per DB)
sudo -u postgres psql -d quran_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. Set master encryption key di .env (untuk meng-encrypt API key di DB)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# salin output → APP_ENCRYPTION_KEY=... di .env, restart API
```

**Per environment** (sekali, dari UI admin):

1. Login sebagai admin → buka **`/admin/settings/ai`**
2. Isi **OpenAI API key**, klik **Simpan**, lalu **Test koneksi**
3. Klik **Mulai seeding embeddings** — pantau di `/admin/seed` (job
   `embeddings`). Durasi ~5 menit, biaya ~$0.01 OpenAI sekali jalan.

Setelah itu:
- `/tanya` (chat UI) langsung jalan
- Toggle **"Tanya AI"** di search beranda menjadi aktif
- Per query biaya ~$0.000001 (input cuma query user, output cuma 1 vector)

**Pipeline `/quran/ask`:**

1. Strip filler ("ayat tentang …") → query inti
2. Embed (cek **Redis cache** dulu; TTL 7 hari, key = sha256(query+model))
3. **Hybrid retrieval paralel**:
   - **Semantic**: cosine NN di `ayat_embeddings.embedding` (pgvector HNSW)
   - **Text**: trigram `pg_trgm` similarity di `teksIndonesia`
4. **Reciprocal Rank Fusion** (RRF, k=60), blended dengan raw semantic score
5. **Threshold filter** (`ai.score_threshold`, default 0.3) — drop noise
6. **Hydrate** dengan tafsir Kemenag snippet (260 char), surah meta
7. **Optional GPT summary** (gpt-4o-mini, 1-2 kalimat, system prompt:
   netral, cite Q.S., tidak mengarang)
8. **Log ke `ai_queries`** (fire-and-forget): query, scores, tokens,
   cached, latency, clientHint (hashed)

**Conversation memory** — `POST /quran/ask` accepts `{ q, conversationId,
history: [{ q, hitIds }] }`. Sampai 3 turn terakhir dimasukkan ke chat
prompt sebagai pasangan user/assistant supaya follow-up ("apa lagi yang
relevan?") coherent.

**Admin dashboards:**
- `/admin/settings/ai` — API key + advanced config (model, threshold,
  budget, summary toggle)
- `/admin/ai/queries` — log lengkap + **top queries 30d** + **gap
  content** (no-match queries → inspirasi konten baru)
- `/admin/ai/cost` — total spend per range (7d/30d/90d), token usage
  chart, per-model breakdown vs rate-card, budget alert ≥80%, dan
  konversi ballpark ke IDR

**Catatan teknis:**
- Vektor 1536-dim disimpan di `ayat_embeddings.embedding` dengan **HNSW
  index** (cosine distance) — query <30ms untuk 6.236 row.
- Embedding **idempotent**: rerun seed hanya akan re-embed ayat yang
  teksnya berubah (`sourceHash` mismatch).
- Query embedding cache (Redis 7d) menurunkan biaya >90% untuk top
  queries — popular search "ayat tentang sabar" → 0 OpenAI call setelah
  pertama.
- API key di `app_settings` di-encrypt **AES-256-GCM** dengan master key
  per-record salt. Master key di env (`APP_ENCRYPTION_KEY`), nilai
  ciphertext aman di DB & snapshot.
- Konfigurasi dapat di-swap kapan saja tanpa restart — `SettingsService`
  caching dengan invalidasi otomatis on-write.
- `/tanya` UI: AI summary card di atas, ayat list dengan match badge
  (makna/teks/makna+teks), tafsir Kemenag collapsible, voice input
  (Web Speech API id-ID), session reset, sticky composer dengan textarea
  auto-resize.

## Self-hosted audio cache

API tidak men-stream MP3 langsung dari `cdn.equran.id` ke browser. Sebagai
gantinya:

- Endpoint `GET /audio/stream/:qari/surah/:nomor` (dan ayat varian) men-stream
  MP3 dari volume Docker `audio_cache` (`AUDIO_CACHE_DIR=/app/audio-cache`).
- Pada miss pertama, file di-download dari equran CDN, di-cache atomik
  (`.part` → rename), dan di-stream ke client. Request berikutnya hit disk.
- `GET /audio/surat/:nomor` (yang mengembalikan URL) sekarang **selalu**
  mengembalikan URL self-hosted (`url`), plus referensi sumber CDN
  (`sourceUrl`) untuk debug.

Untuk pre-warm semua qari × surah × ayat (~225 ribu file, ~2 GB):

```bash
curl -X POST http://localhost:3000/api/v1/seed/start/audio \
  -H "x-seed-admin-key: $SEED_ADMIN_KEY"
```

Setelah warm, equran.id boleh sepenuhnya offline — playback tetap jalan.

## Snapshot konten (deploy ke env lain tanpa re-seed)

Data Quran/tafsir/doa/kota itu **immutable** — seed sekali, lalu **export
snapshot** sebagai artifact yang dipakai env-env lain (staging, VPS lain,
dev machine). Hemat 5-10 menit + tidak membebani equran.id berkali-kali.

```bash
# 1. Setelah seed selesai di env "source" (mis. VPS production):
curl -X POST http://localhost:3000/api/v1/seed/snapshot/export \
  -H "x-seed-admin-key: $SEED_ADMIN_KEY"
# → {"name":"quran-content-20260527093000.sql.gz","size":...,"path":"/app/snapshots/..."}

# 2. List snapshot yang ada:
curl http://localhost:3000/api/v1/seed/snapshot \
  -H "x-seed-admin-key: $SEED_ADMIN_KEY"

# 3. Copy file dari volume `snapshots` ke env target (scp/S3/git LFS/dll).

# 4. Di env target — pastikan migration sudah jalan, lalu:
curl -X POST http://localhost:3000/api/v1/seed/snapshot/import \
  -H "x-seed-admin-key: $SEED_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"filename":"quran-content-20260527093000.sql.gz"}'
```

Atau pakai script standalone untuk dev:

```bash
DATABASE_URL=postgresql://... ./scripts/restore-snapshot.sh ./quran-content-XXX.sql.gz
```

Snapshot **hanya** memuat tabel konten (`surahs`, `ayat`, `tafsir`,
`tafsir_ayat`, `doa`, `kota`, `jadwal_sholat`). Data user (`users`,
`bookmarks`, `hafalan`, `refresh_tokens`, `reading_progress`) **tidak** ikut
— itu environment-specific.

## Ringkasan endpoint

Prefix: `/api/v1`. Format response: `{ success, message, data, meta? }`.

| Grup           | Endpoint |
| -------------- | -------- |
| Quran          | `GET /quran/surat?since=`, `/quran/surat/:nomor`, `/quran/surat/:nomor/ayat/:ayat`, `/quran/juz/:nomor`, `/quran/halaman/:nomor`, `/quran/random`, `/quran/search?q=&lang=`, `/quran/dump` (full JSON untuk first-install Android) |
| Audio          | `GET /audio/surat/:nomor?qari=`, `/audio/ayat/:surat/:ayat?qari=`, `/audio/qari`, **`/audio/stream/:qari/surah/:nomor`** (proxy MP3), **`/audio/stream/:qari/ayat/:surat/:ayat`** |
| Tafsir         | `GET /tafsir/list`, `/tafsir/:surat`, `/tafsir/:surat/:ayat` |
| Translation    | `GET /translation/list`, `/translation/:sumber/:surat`, `/translation/:sumber/:surat/:ayat` — sumber: `sahih-international`, `pickthall`, `kemenag-2019` |
| Asbabun Nuzul  | `GET /asbab-nuzul/:surat`, `/asbab-nuzul/:surat/:ayat` |
| Doa            | `GET /doa?page=&limit=`, `/doa/random`, `/doa/:id` |
| Wirid          | `GET /wirid/pagi`, `/wirid/petang` — dzikir harian terurut + jumlah hitungan |
| Topic Explorer | `GET /topic`, `/topic/:slug` (AI summary + related topics + reading plan), `/topic/:slug/ayat?source=all\|curated\|ai`, `POST /topic/:slug/ask` (scoped semantic search) |
| Niat Shalat    | `GET /niat-shalat`, `/niat-shalat/:slug` (niatsubuh/niatdzuhur/niatashar/niatmaghrib/niatisya) |
| Bacaan Shalat  | `GET /bacaan-shalat` — 10 gerakan dengan 31 bacaan |
| Tahlil         | `GET /tahlil` — 44 entry urutan tahlil lengkap |
| Ayat Sajdah    | `GET /quran/sajdah` — 15 ayat sajdah, di-tag wajibah/mukhtalaf di Ayat.sajdah |
| Sholat         | `GET /sholat/provinsi`, `/sholat/kota?provinsi=`, `/sholat/:kotaId?bulan=&tahun=`, `/sholat/:kotaId/hari-ini` |
| Hadis Qudsi    | `GET /hadis-qudsi?limit=`, `/hadis-qudsi/random`, `/hadis-qudsi/:nomor` |
| Kisah Nabi     | `GET /nabi`, `/nabi/:slug`, `/nabi/urutan/:n` |
| Sirah          | `GET /sirah`, `/sirah/:slug` |
| Khutbah        | `GET /khutbah?tema=&q=`, `/khutbah/tema`, `/khutbah/random`, `/khutbah/:slug` |
| Kata-perkata   | `GET /quran/ayat/:id/kata`, `/quran/surat/:nomor/ayat/:nomorAyat/kata` — 6.236 ayat × ~12 kata, sumber api.quran.com (id), populated via seed `ayat_kata` |
| Hijriah        | `GET /hijri/today`, `/hijri/months`, `/hijri/to-hijri?date=YYYY-MM-DD`, `/hijri/to-gregorian?date=YYYY-MM-DD` |
| Quiz           | `GET /quiz/sambung-ayat`, `/quiz/isi-kata` — soal random untuk muraja'ah |
| Auth           | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| User 🔒        | `GET/PUT /user/profile`, `GET/PUT /user/progress`, `GET/POST /user/bookmark?page=&limit=`, `DELETE /user/bookmark/:id`, `GET/POST /user/hafalan?page=&limit=`, `GET /user/hafalan/review`, `PUT /user/hafalan/:id/review`, `GET/POST /user/devices`, `DELETE /user/devices/:token` |
| Notes 🔒       | `GET/POST /me/notes`, `PUT/DELETE /me/notes/:id`, `GET /me/notes/ayat/:ayatId` — catatan ayat personal |
| Streak 🔒      | `POST /me/reading-session`, `GET /me/streak`, `GET/PUT /me/goal` — streak harian + target baca |
| Analytics      | `POST /analytics/pageview` — first-party page-view tracker (anon-friendly, JWT optional auto-attribusi) |
| AI Search      | `GET /quran/ask?q=&limit=&withSummary=&conversationId=` — hybrid (pgvector + trigram, RRF fusion) + GPT summary + tafsir snippet. `POST /quran/ask` body `{ q, limit?, withSummary?, conversationId?, history? }` — sama tapi support conversation memory. Rate-limit 30/menit/IP. |
| Admin Content 🛡️ | `/admin/content/{doa,topic,khutbah,hadis-qudsi,sirah,nabi,asmaul-husna,niat-shalat,bacaan-shalat,tahlil,sajdah}` — CRUD per konten. Full CRUD untuk: doa/topik/khutbah/hadis-qudsi/sirah/tahlil. Update-only: nabi, asmaul-husna detail, niat-shalat, bacaan-shalat (jumlahnya fixed). Sajdah: toggle jenis (wajibah/mukhtalaf) per ayat. **Topic Explorer AI actions**: `POST /admin/content/topic/:slug/ai/{summary,expand,plan}`, `POST /admin/content/topic/ai/{expand-all,summary-all}`, `GET /admin/content/topic/ai/discover`. Semua mutasi di-audit. |
| Admin Analytics 🛡️ | `GET /admin/analytics/{users,content,engagement,search,traffic,traffic/realtime}` — agregat user/content/engagement, top search, web traffic & realtime |
| Admin AI 🛡️    | `GET /admin/settings?category=ai\|ai-advanced`, `PUT /admin/settings`, `PUT /admin/settings/:key`, `POST /admin/settings/ai/test`, `GET /admin/ai/coverage`, `GET /admin/ai/cost?range=`, `GET /admin/ai/queries?page=&limit=&onlyNoResults=` — config (encrypted secrets), test, embedding coverage, cost dashboard, query log + gap content |
| API Key 🔑     | `POST/GET /admin/api-keys`, `PUT /admin/api-keys/:id/enable`, `PUT /admin/api-keys/:id/disable`, `DELETE /admin/api-keys/:id` |
| Seed 🔑        | `POST /seed/start`, `POST /seed/start/:job` (jobs: surah/ayat/tafsir/tafsir_extra/doa/kota/audio/translation/asbabun_nuzul/topic/jadwal_sholat/hadith/asmaul_husna/**ayat_kata**/**embeddings**), `GET /seed/status`, `GET /seed/status/:job`, `DELETE /seed/reset` |
| Snapshot 🔑    | `POST /seed/snapshot/export`, `GET /seed/snapshot`, `POST /seed/snapshot/import`, `DELETE /seed/snapshot/:filename` |

🔒 = butuh `Authorization: Bearer <accessToken>` · 🛡️ = butuh JWT user dengan `role=admin` · 🔑 = butuh `x-seed-admin-key` (atau JWT admin)

### Mobile-app-friendly conventions

- **Pagination**: query params `page` (1-based) + `limit` (max 200). Response meta: `{ total, page, limit, totalPages, hasMore }`.
- **Delta sync**: list endpoints support `?since=ISO8601`. Server returns hanya row `updatedAt > since`. Cocok untuk app yang simpan `lastSyncAt` di local storage.
- **ETag / If-None-Match**: endpoint konten (surat, ayat, tafsir, doa, asbab) selalu kembalikan `ETag` + `Cache-Control: max-age=…`. App resend dengan `If-None-Match: <etag>` → server balas **304 Not Modified** kalau belum berubah. Hemat bandwidth.
- **X-API-Version**: response header berisi versi API (`v1`). Client app bisa watch ini untuk deteksi breaking change.
- **X-API-Key** (optional): generate di `/admin/api-keys`, kirim di tiap request app untuk identifikasi & per-key rate limit. Terpisah dari JWT user.

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
