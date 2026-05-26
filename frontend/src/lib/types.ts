export interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  cached?: boolean;
  [key: string]: unknown;
}

export interface SurahListItem {
  id: number;
  nomor: number;
  nama: string;
  namaLatin: string;
  arti: string;
  jumlahAyat: number;
  tempatTurun: string;
  audioFullUrl?: Record<string, string>;
}

export interface Ayat {
  id: number;
  surahId: number;
  nomorAyat: number;
  teksArab: string;
  teksLatin: string;
  teksIndonesia: string;
  audioUrls?: Record<string, string>;
  juz?: number | null;
  halaman?: number | null;
  surah?: { nomor: number; nama?: string; namaLatin: string };
}

export interface SurahDetail extends SurahListItem {
  deskripsi: string;
  ayat: Ayat[];
}

export interface Qari {
  id: string;
  nama: string;
}

export interface TafsirAyat {
  ayat: number;
  teks: string;
}

export interface TafsirSurah {
  surah: { nomor: number; namaLatin: string; jumlahAyat: number };
  sumber: string;
  tafsir: TafsirAyat[];
}

export interface Doa {
  id: number;
  judul: string;
  arab: string;
  latin: string;
  terjemah: string;
  sumber?: string | null;
  grup?: string | null;
  tag?: string | null;
}

export interface JadwalSholat {
  id: number;
  kotaId: string;
  namaKota: string;
  provinsi: string;
  tanggal: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
}

export interface Kota {
  id: string;
  nama: string;
  provinsi: string;
}

export interface User {
  id: string;
  email: string;
  nama: string | null;
  role: string;
  createdAt?: string;
  _count?: { bookmarks: number; hafalan: number };
}

export interface Bookmark {
  id: string;
  ayatId: number;
  catatan?: string | null;
  createdAt: string;
  ayat?: Ayat;
}

export interface Hafalan {
  id: string;
  ayatId: number;
  level: number;
  nextReviewAt: string;
  lastReviewAt: string | null;
  ayat?: Ayat;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
}

export interface AuthResult extends AuthTokens {
  user: User;
}
