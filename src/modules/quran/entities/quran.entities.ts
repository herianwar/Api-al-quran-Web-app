import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger response models for the Quran endpoints. These mirror the shapes the
 * QuranService actually returns AFTER mapAyatRow/proxySurahAudio rewrite the
 * audio URLs (so `audioUrls`/`audioFullUrl` are documented as our self-hosted
 * `/audio/stream/...` proxy paths, not the upstream CDN). Wired onto the
 * controller with @ApiOkResponse; the success envelope (ApiSuccess) is added in
 * main.ts → enrichResponseSchemas().
 */
export class AyatEntity {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1, description: 'FK ke surah.id' })
  surahId!: number;

  @ApiProperty({ example: 1, description: 'Nomor ayat dalam surat' })
  nomorAyat!: number;

  @ApiProperty({
    example: 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ',
    description: 'Teks Arab ayat (polos, dengan harakat).',
  })
  teksArab!: string;

  @ApiProperty({
    example:
      'بِسْمِ <span class="tj tj-ham_wasl">ٱ</span>للَّهِ <span class="tj tj-laam_shamsiyah">ل</span>رَّحْمَٰنِ',
    nullable: true,
    description:
      'Teks Arab dengan markup tajwid berwarna: HTML `<span class="tj tj-<kaidah>">…</span>` ' +
      '(kaidah: ham_wasl, laam_shamsiyah, madda_normal, madda_permissible, madda_necessary, ' +
      'qalqalah, ikhafa, idgham_ghunnah, iqlab, ghunnah, dll). Di-seed dari Quran.com lalu ' +
      'disimpan di DB — disajikan self-hosted, tanpa panggilan eksternal saat runtime. ' +
      'Null bila ayat belum di-backfill tajwid.',
  })
  teksArabTajwid!: string | null;

  @ApiProperty({
    example: 'Bismillāhir-raḥmānir-raḥīm(i).',
    description: 'Transliterasi Latin',
  })
  teksLatin!: string;

  @ApiProperty({
    example: 'Dengan nama Allah Yang Maha Pengasih lagi Maha Penyayang.',
    description: 'Terjemahan Bahasa Indonesia (Kemenag)',
  })
  teksIndonesia!: string;

  @ApiProperty({
    description:
      'Map qari → URL audio per-ayat (proxy streaming lokal, bukan CDN).',
    example: {
      '01': '/api/v1/audio/stream/01/ayat/1/1',
      '05': '/api/v1/audio/stream/05/ayat/1/1',
    },
    additionalProperties: { type: 'string' },
  })
  audioUrls!: Record<string, string>;

  @ApiProperty({ example: 1, nullable: true, description: 'Nomor juz (1-30)' })
  juz!: number | null;

  @ApiProperty({
    example: 1,
    nullable: true,
    description: 'Nomor halaman mushaf (1-604)',
  })
  halaman!: number | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description:
      'Jenis sajdah jika ayat ini ayat sajdah ("wajibah" / "mukhtalaf"); null bila bukan.',
  })
  sajdah!: string | null;
}

/** Ringkasan surat (dipakai pada GET /quran/surat). */
export class SurahEntity {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1, description: 'Nomor surat (1-114)' })
  nomor!: number;

  @ApiProperty({ example: 'الفاتحة', description: 'Nama surat (Arab)' })
  nama!: string;

  @ApiProperty({ example: 'Al-Fatihah' })
  namaLatin!: string;

  @ApiProperty({ example: 'Pembukaan' })
  arti!: string;

  @ApiProperty({ example: 7 })
  jumlahAyat!: number;

  @ApiProperty({ example: 'Mekah', description: 'mekah / madinah' })
  tempatTurun!: string;

  @ApiProperty({
    description: 'Map qari → URL audio surat penuh (proxy lokal).',
    example: { '01': '/api/v1/audio/stream/01/surah/1' },
    additionalProperties: { type: 'string' },
    nullable: true,
  })
  audioFullUrl!: Record<string, string> | null;

  @ApiProperty({ example: '2026-05-27T14:33:46.972Z' })
  updatedAt!: string;
}

/** Detail surat lengkap dengan seluruh ayat (GET /quran/surat/:nomor). */
export class SurahDetailEntity extends SurahEntity {
  @ApiProperty({
    description: 'Deskripsi / muqaddimah surat (boleh berisi HTML <i>…</i>).',
    example: 'Surat Al-Faatihah (Pembukaan) yang diturunkan di Mekah …',
  })
  deskripsi!: string;

  @ApiProperty({ type: () => [AyatEntity], description: 'Seluruh ayat surat' })
  ayat!: AyatEntity[];
}

/** Satu ayat + ringkasan surat induknya (GET /quran/ayat/:nomor/:nomorAyat). */
export class AyatWithSurahEntity extends AyatEntity {
  @ApiProperty({
    description: 'Ringkasan surat induk',
    example: { nomor: 1, nama: 'الفاتحة', namaLatin: 'Al-Fatihah' },
  })
  surah!: { nomor: number; nama: string; namaLatin: string };
}
