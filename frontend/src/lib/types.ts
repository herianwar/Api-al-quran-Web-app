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
  authorId?: string | null;
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
  rating?: number | null;
  ratingCount: number;
  soldCount: number;
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

// ─── Muslimah: Asisten Haid & Ibadah ────────────────────────────────────

export type HaidJenis = "haid" | "nifas" | "istihadhah";
export type IbadahStatus = HaidJenis | "suci";

export interface HaidPeriod {
  id: string;
  jenis: HaidJenis;
  mulai: string; // YYYY-MM-DD
  selesai: string | null;
  berlangsung: boolean;
  durasiHari: number | null;
  catatan: string | null;
  createdAt: string;
  updatedAt: string;
  qadhaRamadhan?: number; // hanya pada response create
}

export interface IbadahRuling {
  status: IbadahStatus;
  label: string;
  sholat: { boleh: boolean; teks: string };
  puasa: { boleh: boolean; teks: string };
  tilawah: { boleh: boolean; teks: string };
  catatan: string[];
}

export interface IbadahStatusResult {
  tanggal: string;
  hijri: { formatted: string; weekday: string };
  status: IbadahStatus;
  hariKe: number | null;
  periode: HaidPeriod | null;
  ibadah: IbadahRuling;
}

export interface PuasaSunnahDay {
  tanggal: string;
  weekday: string;
  hijri: string;
  hijriDay: number;
  hijriMonth: number;
  label: string[];
  utama: boolean;
  haid: boolean;
}

export interface HariTerlarang {
  tanggal: string;
  weekday: string;
  hijri: string;
  sebab: string;
}

export interface PuasaSunnahResult {
  mulai: string;
  akhir: string;
  hari: number;
  puasaSunnah: PuasaSunnahDay[];
  hariTerlarang: HariTerlarang[];
}

export interface QadhaPuasa {
  id: string;
  sumber: string;
  tahun: number | null;
  jumlah: number;
  lunas: number;
  sisa: number;
  selesai: boolean;
  catatan: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrediksiHaid {
  cukupData: boolean;
  jumlahData: number;
  rataSiklus: number | null;
  rataDurasi: number | null;
  haidTerakhir: string | null;
  prediksiMulai: string | null;
  prediksiSelesai: string | null;
  hariLagi: number | null;
  keterangan: string;
}

export interface AmalanItem {
  key: string;
  label: string;
  grup: string;
  done: boolean;
}

export interface AmalanHari {
  tanggal: string;
  total: number;
  selesai: number;
  persen: number;
  items: AmalanItem[];
}

export interface AmalanStats {
  current: number;
  activeToday: boolean;
  total: number;
  last14: { tanggal: string; count: number }[];
}

export interface MuslimahDashboard {
  tanggal: string;
  hijri: { formatted: string; weekday: string };
  statusHaid: {
    status: IbadahStatus;
    label: string;
    hariKe: number | null;
    periode: HaidPeriod | null;
    ibadah: IbadahRuling;
  };
  qadhaPuasa: { totalHutang: number; totalLunas: number; sisa: number };
  puasaSunnahBerikutnya: PuasaSunnahDay | null;
  hafalanReviewDue: number;
  amalanHariIni: { selesai: number; total: number; persen: number };
  prediksi: {
    cukupData: boolean;
    prediksiMulai: string | null;
    hariLagi: number | null;
    rataSiklus: number | null;
    keterangan: string;
  };
}

// ─── Tilawah & Khatam ───────────────────────────────────────────────────

export interface ReadingGoal {
  unit: string;
  target: number;
  default?: boolean;
}

export interface ReadingStreak {
  current: number;
  longest: number;
  todayCount: number;
  activeToday: boolean;
  last30Days: { tanggal: string; ayatCount: number }[];
}

export interface KhatamProgress {
  id: string;
  mulai: string;
  targetTanggal: string;
  totalAyat: number;
  ayatDibaca: number;
  sisaAyat: number;
  persen: number;
  totalHari: number;
  hariBerjalan: number;
  sisaHari: number;
  targetPerHari: number;
  targetPerHariSisa: number;
  onTrack: boolean;
  selesai: boolean;
}

// ─── Serambi (feed kutipan/renungan admin) ──────────────────────────────

export type SerambiStatus = "draft" | "scheduled" | "published" | "archived";
export type SerambiCommentStatus = "visible" | "hidden";

/** Post Serambi (bentuk admin — raw row dari /admin/serambi/posts). */
export interface SerambiPost {
  id: string;
  body: string;
  imageUrl: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorId: string | null;
  verified: boolean;
  status: SerambiStatus;
  scheduledAt: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Master penulis Serambi (dipilih di form post daripada ketik manual). */
export interface SerambiAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { posts: number };
}

/** Komentar Serambi untuk moderasi admin (+ user & post terkait). */
export interface SerambiComment {
  id: string;
  postId: string;
  userId: string;
  body: string;
  status: SerambiCommentStatus;
  createdAt: string;
  user?: { id: string; nama: string | null; email: string } | null;
  post?: { id: string; body: string } | null;
}
