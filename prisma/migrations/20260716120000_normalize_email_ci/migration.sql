-- Normalisasi email case-insensitive di tabel users.
--
-- Konteks: kolom `email` @unique bersifat case-sensitive, sehingga
-- `Budi@Gmail.com` dan `budi@gmail.com` bisa jadi dua akun berbeda dan user
-- yang daftar dengan huruf besar gagal login saat mengetik huruf kecil.
--
-- PRASYARAT: jalankan dulu deteksi tabrakan (langkah A) dan pastikan KOSONG
-- sebelum migrasi ini di-apply:
--   SELECT lower(email) AS email_ci, count(*) AS jml, array_agg(id) AS ids
--   FROM users GROUP BY lower(email) HAVING count(*) > 1;
-- Bila ada duplikat, selesaikan manual dulu (gabung/arsipkan akun bentrok);
-- baris UPDATE di bawah akan gagal (unique violation di kolom email) bila
-- masih ada tabrakan — jadi migrasi ini self-protecting, tapi jangan
-- diandalkan sebagai satu-satunya pengecekan.

-- Langkah B: normalisasi baris existing ke trimmed-lowercase.
UPDATE "users"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

-- Belt & suspenders: unique index fungsional agar duplikat case-insensitive
-- mustahil dibuat client mana pun. Kolom `email` tetap @unique biasa.
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_key" ON "users" (lower("email"));
