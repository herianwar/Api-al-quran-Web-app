/** Shapes returned by equran.id API v2. Mapping is defensive in the services
 * that consume these, because some endpoints use slightly different field
 * names across versions. */

export interface EquranEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface EquranSuratListItem {
  nomor: number;
  nama: string;
  namaLatin: string;
  jumlahAyat: number;
  tempatTurun: string;
  arti: string;
  deskripsi: string;
  audioFull?: Record<string, string>;
}

export interface EquranAyat {
  nomorAyat: number;
  teksArab: string;
  teksLatin: string;
  teksIndonesia: string;
  audio?: Record<string, string>;
}

export interface EquranSuratDetail extends EquranSuratListItem {
  ayat: EquranAyat[];
}

export interface EquranTafsirItem {
  ayat: number;
  teks: string;
}

export interface EquranTafsirDetail {
  nomor: number;
  namaLatin: string;
  tafsir: EquranTafsirItem[];
}

export interface EquranDoaItem {
  id?: number;
  grup?: string;
  nama?: string;
  judul?: string;
  ar?: string;
  arab?: string;
  tr?: string;
  latin?: string;
  idn?: string;
  indo?: string;
  terjemah?: string;
  tentang?: string;
  sumber?: string;
  tag?: string[] | string;
}
