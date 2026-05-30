"use client";

import {
  Bell,
  BookOpen,
  Bookmark,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Code2,
  Compass,
  Copy,
  Database,
  Download,
  ExternalLink,
  GraduationCap,
  Headphones,
  Home,
  Languages,
  Layers,
  Moon,
  Palette,
  Quote,
  Rocket,
  ScrollText,
  Search,
  ServerCog,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Sunrise,
  Target,
  Users,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}
interface FeatureGroup {
  label: string;
  tone: string; // tailwind text color class for icons
  items: Feature[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: "Al-Qur'an & Tafsir",
    tone: "text-emerald-600",
    items: [
      {
        icon: BookOpen,
        title: "Mushaf 114 Surat",
        desc: "Teks Arab, latin, & terjemahan per ayat. Lengkap dengan penanda juz dan nomor halaman mushaf serta mode baca per halaman.",
      },
      {
        icon: Headphones,
        title: "Audio Murottal",
        desc: "Banyak pilihan qari, putar per ayat atau satu surat, streaming langsung dengan proxy audio lokal.",
      },
      {
        icon: ScrollText,
        title: "Tafsir Multi-Sumber",
        desc: "Tafsir Kemenag, Ibnu Katsir, dan Al-Muyassar — bisa pilih sumber per ayat.",
      },
      {
        icon: Languages,
        title: "Terjemahan Multi-Bahasa",
        desc: "Terjemahan Bahasa Indonesia dan English, dapat dikembangkan ke bahasa lain.",
      },
      {
        icon: Quote,
        title: "Asbabun Nuzul",
        desc: "Konteks dan sebab turunnya ayat untuk pemahaman yang lebih utuh.",
      },
      {
        icon: Languages,
        title: "Terjemah per Kata",
        desc: "Arti kata demi kata (word-by-word) untuk bantu memahami struktur ayat.",
      },
      {
        icon: Search,
        title: "Pencarian Ayat",
        desc: "Cari cepat di teks Arab, latin, maupun terjemahan (pencarian trigram instan).",
      },
    ],
  },
  {
    label: "Hadis & Ilmu",
    tone: "text-indigo-600",
    items: [
      {
        icon: BookOpen,
        title: "Hadis 9 Perawi",
        desc: "Bukhari, Muslim, Abu Dawud, Tirmidzi, dan lainnya dalam Bahasa Indonesia, lengkap dengan pencarian.",
      },
      {
        icon: Sparkles,
        title: "Hadis Qudsi",
        desc: "Koleksi hadis qudsi pilihan dengan teks Arab dan terjemahan.",
      },
      {
        icon: Star,
        title: "Asmaul Husna",
        desc: "99 Nama Allah dengan tulisan Arab, latin, arti, dan faidah.",
      },
      {
        icon: Users,
        title: "Kisah 25 Nabi",
        desc: "Narasi kisah 25 nabi beserta ayat-ayat rujukan terkait.",
      },
      {
        icon: BookOpen,
        title: "Sirah Nabawiyah ﷺ",
        desc: "Perjalanan hidup Rasulullah ﷺ disusun rapi per babak.",
      },
      {
        icon: ScrollText,
        title: "Khutbah Jumat",
        desc: "Kumpulan materi khutbah Jumat siap pakai.",
      },
    ],
  },
  {
    label: "Ibadah Harian",
    tone: "text-amber-600",
    items: [
      {
        icon: Sunrise,
        title: "Jadwal Sholat",
        desc: "Waktu sholat akurat per kota per hari, siap dihubungkan ke notifikasi adzan.",
      },
      {
        icon: Compass,
        title: "Arah Kiblat",
        desc: "Penunjuk arah kiblat berbasis kompas perangkat.",
      },
      {
        icon: CalendarDays,
        title: "Kalender Hijriah",
        desc: "Konversi & tampilan tanggal Hijriah beserta hari penting.",
      },
      {
        icon: ScrollText,
        title: "Niat & Bacaan Shalat",
        desc: "Panduan niat dan bacaan shalat lengkap dengan latin & arti.",
      },
      {
        icon: Moon,
        title: "Wirid, Tahlil & Sajdah",
        desc: "Wirid pagi & petang, tahlil, serta daftar ayat sajdah.",
      },
      {
        icon: Star,
        title: "Doa & Dzikir Harian",
        desc: "Koleksi doa dan dzikir untuk aktivitas sehari-hari.",
      },
    ],
  },
  {
    label: "Hafalan & Personalisasi",
    tone: "text-rose-600",
    items: [
      {
        icon: ShieldCheck,
        title: "Akun Tersinkron",
        desc: "Daftar/masuk dengan JWT; data tersinkron antar perangkat dengan aman.",
      },
      {
        icon: Bookmark,
        title: "Bookmark Ayat",
        desc: "Simpan ayat favorit dan akses kembali kapan saja.",
      },
      {
        icon: GraduationCap,
        title: "Hafalan + Spaced Repetition",
        desc: "Pelacak hafalan dengan jadwal pengulangan cerdas (spaced repetition).",
      },
      {
        icon: Target,
        title: "Quiz Sambung Ayat",
        desc: "Latihan hafalan interaktif menyambung potongan ayat.",
      },
      {
        icon: ScrollText,
        title: "Catatan Ayat",
        desc: "Tulis catatan pribadi pada ayat tertentu.",
      },
      {
        icon: Sparkles,
        title: "Streak & Progress Baca",
        desc: "Pantau konsistensi tilawah lewat streak harian dan progress.",
      },
    ],
  },
  {
    label: "AI, Toko & Lainnya",
    tone: "text-sky-600",
    items: [
      {
        icon: Brain,
        title: "Tanya AI",
        desc: "Tanya seputar Islam, ayat, dan tafsir dengan asisten AI.",
      },
      {
        icon: ShoppingBag,
        title: "Toko",
        desc: "Katalog produk fisik dengan order via WhatsApp atau form pemesanan dinamis + laporan order.",
      },
      {
        icon: Bell,
        title: "Notifikasi Push",
        desc: "Broadcast dan pengingat terjadwal (FCM) ke perangkat pengguna.",
      },
      {
        icon: Layers,
        title: "Jelajah Tematik",
        desc: "Telusuri ayat berdasarkan tema seperti sabar, syukur, dan doa.",
      },
    ],
  },
];

const STACK: { icon: LucideIcon; label: string; detail: string }[] = [
  { icon: Smartphone, label: "Flutter + Dart", detail: "Material 3, satu basis kode (siap iOS)" },
  { icon: Layers, label: "Riverpod + Clean Architecture", detail: "Feature-first, modular" },
  { icon: ServerCog, label: "Dio + Retrofit", detail: "REST ke API yang sudah ada" },
  { icon: Database, label: "Isar/Drift + Secure Storage", detail: "Offline-first & token aman" },
  { icon: Headphones, label: "just_audio + audio_service", detail: "Murottal background" },
  { icon: Bell, label: "FCM + local_notifications", detail: "Notifikasi adzan & broadcast" },
];

interface Phase {
  no: string;
  title: string;
  goal: string;
  items: string[];
}
const ROADMAP: Phase[] = [
  {
    no: "01",
    title: "Fondasi & Qur'an Offline",
    goal: "MVP yang langsung berguna tanpa internet.",
    items: [
      "Setup proyek Flutter, design system, navigasi 5 tab (go_router)",
      "Unduh GET /quran/dump → simpan ke DB lokal Isar/Drift (offline penuh)",
      "Daftar surat, detail ayat (Arab/latin/terjemah), pencarian",
      "Tafsir multi-sumber & terjemahan",
      "Jadwal sholat per kota",
    ],
  },
  {
    no: "02",
    title: "Konten & Ibadah",
    goal: "Lengkapi kekayaan konten harian.",
    items: [
      "Audio murottal (just_audio + audio_service) + pilih qari",
      "Hadis, Hadis Qudsi, Asmaul Husna",
      "Kisah Nabi, Sirah, Khutbah, Doa",
      "Arah kiblat, kalender Hijriah, niat & bacaan shalat, wirid, tahlil",
    ],
  },
  {
    no: "03",
    title: "Akun & Hafalan",
    goal: "Personalisasi yang tersinkron.",
    items: [
      "Auth JWT (login/refresh rotasi token)",
      "Bookmark, catatan ayat, progress & streak",
      "Hafalan + spaced repetition",
      "Sinkron delta (?since) antar perangkat",
    ],
  },
  {
    no: "04",
    title: "AI, Quiz, Toko & Notifikasi",
    goal: "Fitur pembeda & engagement.",
    items: [
      "Tanya AI (chat)",
      "Quiz sambung ayat",
      "Toko + checkout WA/form",
      "Push notification (FCM) + pengingat adzan",
    ],
  },
  {
    no: "05",
    title: "Polish & Rilis Play Store",
    goal: "Kualitas produksi.",
    items: [
      "Mode gelap, ukuran font Arab, aksesibilitas",
      "Unit & UI test, optimasi performa",
      "App icon adaptif, signing, ProGuard",
      "Rilis ke Google Play",
    ],
  },
];

const DESIGN_PROMPT = `Kamu adalah product designer untuk aplikasi Android "Al-Qur'an Super App" (brand: Rumah Qur'an). Rancang UI/UX yang lengkap, modern, dan menenangkan.

BRAND & GAYA
- Warna primer emerald/teal (hijau), aksen amber, netral slate.
- Nuansa islami, tenang, bersih, premium; banyak ruang kosong; sudut membulat (rounded-2xl); bayangan halus.
- Font ayat: "Amiri Quran" berukuran besar & nyaman dibaca. Latin: Inter/SF.
- Dukung mode TERANG & GELAP. Aksesibilitas: kontras AA, target sentuh >=48dp, skala teks.
- Bottom navigation 5 tab: Beranda, Qur'an, Ibadah, Hafalan, Lainnya.

RANCANG SCREEN-BY-SCREEN (wireframe + komponen + state: loading/empty/error)
1. Onboarding + unduh data offline (indikator progress).
2. Beranda: salam, sholat berikutnya + hitung mundur, ayat hari ini, "lanjut baca", akses cepat fitur.
3. Daftar Surat + pencarian. Detail Surat: tiap ayat punya Arab, latin, terjemah, tombol audio/tafsir/bookmark/catatan; mode baca per halaman mushaf.
4. Pemutar Audio Murottal: mini-player + full-player, pilih qari, ulang ayat.
5. Tafsir (pilih sumber), Asbabun Nuzul, tafsir per kata.
6. Hadis (perawi -> daftar -> detail), Hadis Qudsi, Asmaul Husna, Kisah 25 Nabi, Sirah, Khutbah.
7. Ibadah: Jadwal Sholat (pilih kota), Arah Kiblat (kompas), Kalender Hijriah, Niat/Bacaan Shalat, Wirid, Tahlil, Doa.
8. Hafalan: dashboard hafalan + spaced repetition, Quiz Sambung Ayat, Streak & progress.
9. Personalisasi: Bookmark, Catatan Ayat.
10. Tanya AI (antarmuka chat).
11. Toko: katalog, detail produk, checkout via WhatsApp / form dinamis.
12. Profil & Pengaturan: akun, sinkron, notifikasi, tema, ukuran font, qari default, kota sholat.

DELIVERABLE
- Design system: palet warna, tipografi, spacing, ikon, dan komponen (button, card, chip, list-item ayat, bottom nav, dialog, mini-player).
- Untuk tiap screen: layout, komponen kunci, alur navigasi, micro-interaction, dan seluruh state.
- Sertakan variasi light & dark.`;

const CODE_PROMPT = `Bangun aplikasi mobile dengan FLUTTER untuk "Al-Qur'an Super App" yang mengonsumsi REST API yang SUDAH ADA (target utama Android, siap diperluas ke iOS).

API
- Base URL: https://rumahquran.id/api/v1
- Format respons: { success, message, data, meta? } — selalu baca field "data".
- Pagination: ?page=1&limit=20; meta { total, page, limit, totalPages, hasMore }.
- Delta sync: banyak endpoint list menerima ?since=ISO8601 (hanya yang berubah).
- ETag: endpoint konten kirim ETag + Cache-Control; pakai If-None-Match -> 304.
- Dokumentasi: https://rumahquran.id/api/docs (OpenAPI di /api/docs-json).

TECH STACK (FLUTTER)
- Flutter + Dart, Material 3. Arsitektur Clean (data/domain/presentation), feature-first/modular.
- State management & DI: Riverpod (+ get_it/injectable bila perlu).
- Network: Dio + retrofit (generator) + interceptor. Model: freezed + json_serializable.
- Offline-first: Isar (atau Drift) sebagai single source of truth; flutter_secure_storage untuk token; shared_preferences untuk preferensi.
- Gambar: cached_network_image. Audio: just_audio + audio_service + just_audio_background (putar latar + kontrol notifikasi).
- Notifikasi: firebase_messaging + flutter_local_notifications (+ workmanager untuk pengingat adzan); daftarkan device token ke /user/device-tokens.
- Navigasi: go_router, bottom nav 5 tab. Font ayat: Amiri (google_fonts/bundle).

OFFLINE
- Saat pertama dibuka, panggil GET /quran/dump (~10MB: surat+ayat+tafsir) -> simpan ke Isar/Drift.
- Setelah itu baca dari lokal; sinkron berkala memakai ?since untuk hemat kuota.

AUTH
- POST /auth/register, /auth/login -> { accessToken, refreshToken }.
- Access token di memori; refresh token di flutter_secure_storage.
- Dio interceptor: lampirkan Authorization: Bearer; pada 401 -> POST /auth/refresh (rotasi token) lalu retry; pakai lock/queue agar refresh hanya sekali (hindari race).

FITUR (endpoint utama)
- Qur'an: /quran/surat, /quran/surat/:n, /quran/random, /quran/search, /quran/dump.
- Audio: /audio. Tafsir: /tafsir. Terjemahan: /translation. Asbabun Nuzul: /asbabun-nuzul. Tematik: /topic.
- Doa: /doa. Hadis: /hadis (+ perawi). Hadis Qudsi. Asmaul Husna: /asmaul-husna.
- Kisah Nabi: /nabi. Sirah: /sirah. Khutbah: /khutbah.
- Sholat: /sholat (kota + jadwal). Hijri: /hijri. Niat/Bacaan Shalat. Wirid. Tahlil. Sajdah.
- User: /user/bookmarks, /user/hafalan (spaced repetition), progress, streak, catatan ayat.
- Quiz: /quiz. AI: /tanya. Toko: /shop (produk + order via WA/form).

KUALITAS
- Loading/empty/error state + retry + skeleton di tiap layar.
- Indikator offline; cache; hemat kuota via ETag/since.
- Pengaturan: tema terang/gelap, ukuran font Arab, qari default, kota sholat, notifikasi adzan.
- Unit test repository & provider + widget test; siapkan rilis Play Store (flutter build appbundle, signing, --obfuscate, ikon adaptif).

Mulai dari FASE 1 (Qur'an offline + tafsir + jadwal sholat), lalu lanjut bertahap.`;

const TOTAL_FEATURES = FEATURE_GROUPS.reduce((n, g) => n + g.items.length, 0);

export default function AndroidPlanPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-12">
      <Hero />
      <FeaturesSection />
      <StackSection />
      <RoadmapSection />
      <PromptsSection />
      <ApiNote />
      <Closing />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-700 text-white px-5 sm:px-10 py-10 sm:py-14 shadow-lg fade-in-up">
      <div
        aria-hidden
        className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-cyan-300/30 blur-3xl aurora"
      />
      <div
        aria-hidden
        className="absolute inset-0 dot-grid opacity-20"
        style={{ maskImage: "radial-gradient(closest-side, black, transparent)" }}
      />
      <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-12 items-center">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-50/90 uppercase tracking-[0.18em] mb-3">
            <Smartphone size={13} /> Roadmap Aplikasi Android
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
            Rencana Aplikasi Android{" "}
            <br className="hidden sm:block" />
            Al-Qur&apos;an Super App
          </h1>
          <p className="text-emerald-50/95 text-base sm:text-lg leading-relaxed mb-6">
            Rencana lengkap & detail membawa seluruh fitur yang sudah ada di web ke
            aplikasi Android — beserta arsitektur, fase pengembangan, dan{" "}
            <span className="font-semibold text-white">
              prompt siap pakai untuk Claude Design &amp; Claude Code
            </span>
            .
          </p>
          <div className="flex flex-wrap gap-2.5">
            <a
              href="#prompt"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-emerald-800 font-bold px-5 py-3.5 text-sm shadow-sm hover:bg-emerald-50 transition"
            >
              <Copy size={16} /> Lihat Prompt
            </a>
            <a
              href="#fitur"
              className="inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold px-5 py-3.5 text-sm transition backdrop-blur-sm"
            >
              Jelajah Fitur <ChevronRight size={16} />
            </a>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
            {[
              { n: `${TOTAL_FEATURES}+`, l: "Fitur" },
              { n: `${FEATURE_GROUPS.length}`, l: "Kategori" },
              { n: `${ROADMAP.length}`, l: "Fase" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-3 text-center"
              >
                <p className="text-2xl sm:text-3xl font-bold tabular-nums">{s.n}</p>
                <p className="text-[11px] uppercase tracking-wider text-emerald-50/80">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </div>
        <PhoneMockup />
      </div>
    </section>
  );
}

/** A decorative app-preview mockup shown beside the hero on large screens. */
function PhoneMockup() {
  const quick: { icon: LucideIcon; label: string }[] = [
    { icon: BookOpen, label: "Qur'an" },
    { icon: Headphones, label: "Murottal" },
    { icon: Star, label: "Doa" },
    { icon: Compass, label: "Kiblat" },
  ];
  const tabs: LucideIcon[] = [Home, BookOpen, Sunrise, GraduationCap, Layers];
  return (
    <div className="hidden lg:block relative shrink-0">
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[3rem] bg-white/10 blur-2xl"
      />
      <div className="relative w-[260px] rounded-[2.6rem] bg-slate-950/90 p-2.5 shadow-2xl ring-1 ring-white/25">
        <div className="absolute left-1/2 top-2.5 -translate-x-1/2 h-5 w-24 rounded-b-2xl bg-slate-950/90 z-10" />
        <div className="rounded-[2.1rem] overflow-hidden bg-slate-50 h-[546px] flex flex-col text-slate-900">
          {/* App header */}
          <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white px-4 pt-7 pb-4">
            <p className="text-[10px] text-emerald-50/85">Assalamu&apos;alaikum 👋</p>
            <p className="font-bold text-sm mb-3">Sahabat Qur&apos;an</p>
            <div className="rounded-xl bg-white/15 backdrop-blur px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-[8px] uppercase tracking-wide text-emerald-50/80">
                  Sholat berikutnya
                </p>
                <p className="text-sm font-bold">Ashar · 15:12</p>
              </div>
              <span className="text-[10px] font-semibold bg-white/20 rounded-full px-2 py-0.5">
                −01:24
              </span>
            </div>
          </div>
          {/* App body */}
          <div className="flex-1 p-3 space-y-2.5">
            <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-sm">
              <p className="text-[8px] font-bold uppercase tracking-wide text-emerald-600 mb-1.5">
                Ayat hari ini
              </p>
              <p
                dir="rtl"
                className="font-arabic text-xl text-slate-900 leading-loose text-right"
              >
                إِنَّ مَعَ الْعُسْرِ يُسْرًا
              </p>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
                &quot;Sesungguhnya bersama kesulitan ada kemudahan.&quot; (94:6)
              </p>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {quick.map((q) => {
                const I = q.icon;
                return (
                  <div
                    key={q.label}
                    className="rounded-xl bg-white border border-slate-100 py-2 flex flex-col items-center gap-1 shadow-sm"
                  >
                    <I size={15} className="text-emerald-600" />
                    <span className="text-[8px] text-slate-600">{q.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="rounded-xl bg-emerald-600 text-white p-2.5 flex items-center gap-2 shadow-sm">
              <BookOpen size={16} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] uppercase tracking-wide text-emerald-50/80">
                  Lanjut baca
                </p>
                <p className="text-xs font-bold truncate">
                  Al-Baqarah · ayat 152
                </p>
              </div>
            </div>
          </div>
          {/* Bottom nav */}
          <div className="bg-white border-t border-slate-100 px-3 py-2 flex justify-between">
            {tabs.map((Tab, i) => (
              <span
                key={i}
                className={`grid h-7 w-7 place-items-center rounded-lg ${
                  i === 0 ? "bg-emerald-50 text-emerald-600" : "text-slate-400"
                }`}
              >
                <Tab size={15} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section id="fitur" className="scroll-mt-20 space-y-6">
      <SectionHead
        eyebrow="Fitur Lengkap"
        title="Semua yang sudah ada, dibawa ke Android"
        desc="Setiap fitur di bawah ini sudah berjalan di API & web — tinggal dibungkus dalam pengalaman mobile native."
      />
      <div className="space-y-8">
        {FEATURE_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-base font-bold text-slate-900">
                {group.label}
              </h3>
              <span className="chip chip-gold !bg-slate-100 !text-slate-500">
                {group.items.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="card card-hover p-4 flex gap-3 fade-in-up"
                  >
                    <span
                      className={`shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-slate-50 ring-1 ring-slate-100 ${group.tone}`}
                    >
                      <Icon size={18} strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-[15px] mb-0.5">
                        {f.title}
                      </p>
                      <p className="text-[13px] text-slate-600 leading-relaxed">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StackSection() {
  return (
    <section className="space-y-6">
      <SectionHead
        eyebrow="Arsitektur"
        title="Tech stack yang direkomendasikan"
        desc="Flutter (lintas platform), offline-first, dan langsung memakai REST API yang sudah live."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {STACK.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card p-4 flex items-center gap-3">
              <span className="shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <Icon size={18} strokeWidth={2.25} />
              </span>
              <div>
                <p className="font-semibold text-slate-900 text-sm">{s.label}</p>
                <p className="text-xs text-slate-500">{s.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Highlight
          icon={Wifi}
          title="Offline-first"
          desc="Unduh sekali via /quran/dump, lalu baca dari database lokal (Isar/Drift) tanpa internet."
        />
        <Highlight
          icon={ShieldCheck}
          title="Auth aman"
          desc="JWT: access di memori, refresh token terenkripsi + rotasi otomatis."
        />
        <Highlight
          icon={Download}
          title="Hemat kuota"
          desc="Sinkron delta (?since) + ETag/304 sehingga hanya kirim data baru."
        />
        <Highlight
          icon={Users}
          title="Ramah semua usia"
          desc="Teks bisa diperbesar, kontras tinggi, mode gelap, dan tombol besar yang mudah disentuh."
        />
      </div>
    </section>
  );
}

function Highlight({
  icon: Icon,
  title,
  desc,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 p-4">
      <Icon size={18} className="text-emerald-600 mb-2" />
      <p className="font-semibold text-slate-900 text-sm">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
    </div>
  );
}

function RoadmapSection() {
  return (
    <section className="space-y-6">
      <SectionHead
        eyebrow="Roadmap"
        title="Fase pengembangan bertahap"
        desc="Dari MVP yang langsung berguna sampai siap rilis di Google Play."
      />
      <div className="relative space-y-3">
        {ROADMAP.map((p) => (
          <div key={p.no} className="card p-5 flex gap-4 fade-in-up">
            <div className="shrink-0">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white font-bold text-sm shadow-sm">
                {p.no}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900">{p.title}</h3>
              <p className="text-xs text-emerald-700 font-medium mb-2">
                {p.goal}
              </p>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                {p.items.map((it) => (
                  <li
                    key={it}
                    className="flex items-start gap-1.5 text-xs text-slate-600"
                  >
                    <Check
                      size={13}
                      className="text-emerald-500 mt-0.5 shrink-0"
                    />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PromptsSection() {
  const [tab, setTab] = useState<"design" | "code">("design");
  return (
    <section id="prompt" className="scroll-mt-20 space-y-6">
      <SectionHead
        eyebrow="Siap Pakai"
        title="Prompt untuk Claude Design & Claude Code"
        desc="Salin prompt di bawah ini ke Claude untuk merancang tampilan, lalu untuk membangun aplikasinya."
      />
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setTab("design")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            tab === "design"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 hover:text-emerald-700"
          }`}
        >
          <Palette size={15} /> Claude Design
        </button>
        <button
          onClick={() => setTab("code")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            tab === "code"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 hover:text-emerald-700"
          }`}
        >
          <Code2 size={15} /> Claude Code
        </button>
      </div>

      {tab === "design" ? (
        <PromptCard
          icon={Palette}
          title="Prompt — Claude Design"
          subtitle="Untuk merancang UI/UX aplikasi Android"
          prompt={DESIGN_PROMPT}
        />
      ) : (
        <PromptCard
          icon={Code2}
          title="Prompt — Claude Code"
          subtitle="Untuk membangun aplikasi Android native"
          prompt={CODE_PROMPT}
        />
      )}
    </section>
  );
}

function PromptCard({
  icon: Icon,
  title,
  subtitle,
  prompt,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  prompt: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for browsers without clipboard API.
      const ta = document.createElement("textarea");
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } finally {
        ta.remove();
      }
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white shrink-0">
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">
              {title}
            </p>
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={copy}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition shrink-0 ${
            copied
              ? "bg-emerald-100 text-emerald-700"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre className="max-h-[28rem] overflow-auto px-4 sm:px-5 py-4 text-[12.5px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words font-mono">
        {prompt}
      </pre>
    </div>
  );
}

function ApiNote() {
  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white shrink-0">
          <ServerCog size={20} />
        </span>
        <div>
          <h3 className="font-bold text-slate-900 mb-1">
            API sudah siap dipakai
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            Aplikasi Android tinggal mengonsumsi REST API yang sudah live —
            tidak perlu membangun backend dari nol. Setiap respons memakai
            envelope <code className="bg-white px-1 rounded text-[11px]">{`{ success, message, data, meta? }`}</code>{" "}
            dan semua endpoint terdokumentasi (request &amp; response) di Swagger.
          </p>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <CodeChip label="Base URL" value="https://rumahquran.id/api/v1" />
            <CodeChip
              label="Swagger UI"
              value="rumahquran.id/api/docs"
              href="https://rumahquran.id/api/docs"
            />
            <CodeChip
              label="OpenAPI JSON"
              value="rumahquran.id/api/docs-json"
              href="https://rumahquran.id/api/docs-json"
            />
            <CodeChip label="Offline dump" value="GET /quran/dump" />
          </div>
          <a
            href="https://rumahquran.id/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-semibold px-4 py-2.5 text-sm hover:bg-emerald-700 transition"
          >
            <ExternalLink size={15} /> Buka Dokumentasi API
          </a>
        </div>
      </div>
    </section>
  );
}

function CodeChip({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
        {label}
        {href && <ExternalLink size={10} />}
      </p>
      <code className="text-xs text-slate-700 break-all">{value}</code>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg bg-white border border-emerald-100 px-3 py-2 hover:border-emerald-400 hover:shadow-sm transition"
      >
        {inner}
      </a>
    );
  }
  return (
    <div className="rounded-lg bg-white border border-emerald-100 px-3 py-2">
      {inner}
    </div>
  );
}

function Closing() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white px-5 sm:px-10 py-9 text-center">
      <div
        aria-hidden
        className="absolute inset-0 dot-grid opacity-10"
      />
      <div className="relative">
        <Rocket size={28} className="mx-auto mb-3 text-emerald-400" />
        <h3 className="text-xl sm:text-2xl font-bold mb-2">
          Siap membangun aplikasinya?
        </h3>
        <p className="text-slate-300 text-sm max-w-xl mx-auto mb-5">
          Mulai dengan menyalin prompt Claude Design untuk merancang tampilan,
          lalu prompt Claude Code untuk membangun fase demi fase.
        </p>
        <a
          href="#prompt"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-6 py-3 text-sm transition"
        >
          <Copy size={16} /> Salin Prompt Sekarang
        </a>
      </div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-1.5">
        {eyebrow}
      </p>
      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-1.5">
        {title}
      </h2>
      <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}
