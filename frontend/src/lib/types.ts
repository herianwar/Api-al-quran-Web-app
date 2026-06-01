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
  teksArabTajwid?: string | null;
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

export interface TafsirSourceMeta {
  sumber: string;
  nama: string;
  bahasa: string;
}

export interface TafsirSurah {
  surah: { nomor: number; namaLatin: string; jumlahAyat: number };
  sumber: TafsirSourceMeta | string;
  tafsir: TafsirAyat[];
}

export interface TranslationSourceMeta {
  sumber: string;
  bahasa: string;
  penerjemah: string;
}

export interface TranslationSurah {
  surah: { id: number; nomor: number; namaLatin: string };
  sumber: TranslationSourceMeta;
  ayat: { nomorAyat: number; teks: string }[];
}

export interface AsbabunNuzulEntry {
  id: number;
  teks: string;
  sumber: string | null;
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

export interface Perawi {
  slug: string;
  nama: string;
  total: number;
}

export interface AsmaulHusna {
  id: number;
  arab: string;
  latin: string;
  arti: string;
  penjelasan?: string | null;
  dalil?: string | null;
  faidah?: string | null;
}

export interface Adzan {
  id: number;
  slug: string;
  judul: string;
  muadzin?: string | null;
  lokasi?: string | null;
  jenis: string;
  durasi?: number | null;
  ukuran?: number | null;
  urutan: number;
}

// ─── Artikel / Portal ────────────────────────────────────────────────
export interface ArtikelKategori {
  id: number;
  slug: string;
  nama: string;
  deskripsi?: string | null;
  urutan: number;
  isActive: boolean;
  jumlahArtikel?: number;
}

export type ArtikelStatus = "draft" | "scheduled" | "published";

/** Card shape returned by list endpoints (no full body). */
export interface ArtikelListItem {
  id: number;
  slug: string;
  judul: string;
  ringkasan?: string | null;
  coverUrl?: string | null;
  coverAlt?: string | null;
  penulis?: string | null;
  status: ArtikelStatus;
  isFeatured: boolean;
  tags: string[];
  menitBaca: number;
  views: number;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  category?: { id: number; slug: string; nama: string } | null;
}

/** Full article (detail + admin edit) — adds the HTML body and relations. */
export interface Artikel extends ArtikelListItem {
  konten: string;
  categoryId?: number | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  related?: ArtikelListItem[];
}

/** A tag with its usage count (admin autocomplete). */
export interface ArtikelTag {
  tag: string;
  count: number;
}

export interface ShopCategory {
  id: number;
  slug: string;
  nama: string;
  deskripsi?: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
}

export interface ShopProductImage {
  id: number;
  url: string;
  alt?: string | null;
  sortOrder: number;
}

export interface ShopProduct {
  id: number;
  slug: string;
  nama: string;
  deskripsi: string;
  hargaIdr: number;
  hargaCoret?: number | null;
  stok?: number | null;
  waNumber?: string | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  categoryId: number;
  category?: ShopCategory;
  images?: ShopProductImage[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ShopBanner {
  id: number;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShopSettings {
  wa_number: string;
  wa_greeting: string;
  shop_title: string;
  shop_description: string;
  /** "wa" = order via WhatsApp, "form" = order via on-site dynamic form. */
  order_mode: "wa" | "form" | string;
  form_success_message: string;
  form_submit_label: string;
  [key: string]: string;
}

export type ShopOrderFieldType =
  | "text"
  | "textarea"
  | "tel"
  | "email"
  | "number"
  | "select";

export interface ShopOrderField {
  id: number;
  key: string;
  label: string;
  type: ShopOrderFieldType;
  placeholder?: string | null;
  helpText?: string | null;
  required: boolean;
  options?: string[] | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ShopOrderStatus =
  | "baru"
  | "diproses"
  | "dikirim"
  | "selesai"
  | "batal";

export interface ShopOrderFieldValue {
  key: string;
  label: string;
  type: string;
  value: string;
}

export interface ShopOrder {
  id: number;
  orderNumber: string;
  productId?: number | null;
  productName: string;
  productSlug?: string | null;
  hargaIdr: number;
  quantity: number;
  totalIdr: number;
  fields: ShopOrderFieldValue[];
  customerName?: string | null;
  customerPhone?: string | null;
  status: ShopOrderStatus;
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
  product?: { slug: string; nama: string; isActive: boolean } | null;
}

export interface Hadis {
  id: number;
  perawiSlug: string;
  nomor: number;
  arab: string;
  terjemahan: string;
  perawi?: Perawi;
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
