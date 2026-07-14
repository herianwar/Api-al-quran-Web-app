"use client";

import {
  BookOpen,
  ChevronDown,
  Compass,
  Home,
  Library,
  CalendarHeart,
  Droplet,
  Flower2,
  ListChecks,
  Menu,
  Moon,
  Newspaper,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Sunrise,
  Target,
  Users,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Top-level items always visible on desktop. Kept small (6) so the bar stays
// breathable on narrow desktops (≥640 sm). Rest live behind "Lainnya".
// Order is tuned for the mobile 3-column grid: Toko lands in the visual
// center of the bottom row so the shop entry stays prominent.
const PRIMARY: NavItem[] = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/artikel", label: "Artikel", icon: Newspaper },
  { href: "/topic", label: "Tematik", icon: Library },
  { href: "/doa", label: "Doa", icon: Star },
  { href: "/sholat", label: "Sholat", icon: Sunrise },
  { href: "/toko", label: "Toko", icon: ShoppingBag },
];

// Everything else, semantically grouped. Used by:
//  • Desktop: a single "Lainnya" dropdown (compact)
//  • Mobile drawer: rendered as labelled sections so 15 items don't feel like
//    a flat wall.
const GROUPS: NavGroup[] = [
  {
    label: "Bacaan",
    items: [
      { href: "/hadis", label: "Hadis", icon: BookOpen },
      { href: "/hadis-qudsi", label: "Hadis Qudsi", icon: BookOpen },
      { href: "/asmaul-husna", label: "Asmaul Husna", icon: Sparkles },
      { href: "/nabi", label: "Kisah 25 Nabi", icon: Users },
      { href: "/sirah", label: "Sirah Nabi ﷺ", icon: BookOpen },
      { href: "/khutbah", label: "Khutbah Jumat", icon: BookOpen },
    ],
  },
  {
    label: "Ibadah harian",
    items: [
      { href: "/wirid", label: "Wirid Pagi & Petang", icon: Moon },
      { href: "/qibla", label: "Arah Kiblat", icon: Compass },
      { href: "/adzan", label: "Audio Adzan", icon: Volume2 },
      { href: "/hijri", label: "Kalender Hijriah", icon: Moon },
      { href: "/shalat/niat", label: "Niat Shalat", icon: Sunrise },
      { href: "/shalat/bacaan", label: "Bacaan Shalat", icon: BookOpen },
      { href: "/tahlil", label: "Tahlil", icon: Sparkles },
      { href: "/sajdah", label: "Ayat Sajdah", icon: BookOpen },
    ],
  },
  {
    label: "Tilawah & Hafalan",
    items: [
      { href: "/tilawah", label: "Target Tilawah & Khatam", icon: Target },
      { href: "/quiz", label: "Quiz Sambung Ayat", icon: Target },
    ],
  },
  {
    label: "Muslimah",
    items: [
      { href: "/muslimah", label: "Dashboard Muslimah", icon: Flower2 },
      { href: "/muslimah/haid", label: "Kalender Haid", icon: Droplet },
      {
        href: "/muslimah/puasa-sunnah",
        label: "Pengingat Puasa Sunnah",
        icon: CalendarHeart,
      },
      { href: "/muslimah/amalan", label: "Amalan Harian", icon: ListChecks },
    ],
  },
  {
    label: "AI",
    items: [{ href: "/tanya", label: "Tanya AI", icon: Sparkles }],
  },
  {
    label: "Aplikasi",
    items: [{ href: "/android", label: "Aplikasi Android", icon: Smartphone }],
  },
];

const SECONDARY: NavItem[] = GROUPS.flatMap((g) => g.items);

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Close mobile drawer on route change so it doesn't stay open across pages.
  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  // Close the "Lainnya" desktop dropdown when clicking outside / pressing Esc.
  useEffect(() => {
    if (!moreOpen) return;
    function onClick(e: MouseEvent): void {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Lock body scroll while the mobile drawer is open — prevents background
  // scroll-bleed when the user swipes inside the menu.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const anySecondaryActive = SECONDARY.some((s) => isActive(s.href));

  // The admin area has its own sidebar (with a "Kembali ke app" link), so the
  // global top bar is redundant there — hide it on /admin routes.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  async function handleLogout(): Promise<void> {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.push("/");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <nav className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-bold text-emerald-700 hover:text-emerald-800 transition shrink-0"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white text-lg shadow-sm">
            ☪
          </span>
          <span className="text-base sm:text-lg tracking-tight">
            Al-Qur&apos;an
          </span>
        </Link>

        {/* Desktop primary nav. Below md the labels disappear, leaving icons —
            so 6 items + Lainnya + user controls comfortably fit a 640px viewport. */}
        <div className="hidden sm:flex items-center gap-0.5">
          {PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`inline-flex items-center gap-1.5 px-2.5 lg:px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                }`}
              >
                <Icon size={15} />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}

          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`inline-flex items-center gap-1 px-2.5 lg:px-3 py-2 rounded-lg text-sm font-medium transition ${
                moreOpen || anySecondaryActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
              }`}
            >
              <Menu size={15} />
              <span className="hidden lg:inline">Lainnya</span>
              <ChevronDown
                size={13}
                className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>
            {moreOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 overflow-y-auto overscroll-contain max-h-[calc(100vh-5rem)]">
                {GROUPS.map((g) => (
                  <div key={g.label} className="py-2 border-b border-slate-100 last:border-b-0">
                    <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {g.label}
                    </p>
                    {g.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-2.5 px-4 py-2 text-sm transition ${
                            active
                              ? "bg-emerald-50 text-emerald-700 font-semibold"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <Icon size={15} className="shrink-0" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="hidden md:inline px-3 py-2 rounded-lg text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/me"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition max-w-[10rem] truncate"
              >
                {user.nama ?? user.email.split("@")[0]}
              </Link>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="hidden md:inline-flex px-3 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {loggingOut ? "Keluar…" : "Keluar"}
              </button>
            </>
          ) : (
            !loading && (
              <Link
                href="/login"
                className="px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition"
              >
                Masuk
              </Link>
            )
          )}
          <button
            className="sm:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-700"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>
    </header>

      {/* Mobile drawer: full-viewport sheet rendered as a SIBLING of <header>
          (not nested) — nesting it inside the sticky/backdrop-blur header
          caused some browsers to clip `position: fixed` because of the
          stacking-context the parent established. As a sibling at z-50 it
          renders reliably on every browser. */}
      {open && (
        <>
          {/* Backdrop that closes the drawer on tap. */}
          <button
            aria-label="Tutup menu"
            onClick={() => setOpen(false)}
            className="sm:hidden fixed inset-0 top-16 z-40 bg-slate-900/30 backdrop-blur-sm"
          />
          <div
            className="sm:hidden fixed inset-x-0 top-16 bottom-0 z-50 bg-white border-t border-slate-200 overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
          <div className="px-4 py-3 space-y-4">
            {user && (
              <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-white p-4 flex items-center gap-3">
                <div className="h-10 w-10 grid place-items-center rounded-full bg-white/20 font-bold">
                  {(user.nama ?? user.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">
                    {user.nama ?? user.email.split("@")[0]}
                  </p>
                  <p className="text-emerald-50/85 text-xs truncate">
                    {user.email}
                  </p>
                </div>
                <Link
                  href="/me"
                  className="px-3 py-1.5 rounded-lg bg-white/20 text-xs font-semibold hover:bg-white/30"
                >
                  Profil
                </Link>
              </div>
            )}

            <section>
              <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Utama
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PRIMARY.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-xs font-medium text-center transition ${
                        active
                          ? "bg-emerald-600 text-white shadow"
                          : "bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                      }`}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </section>

            {GROUPS.map((g) => (
              <section key={g.label}>
                <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {g.label}
                </p>
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition ${
                            active
                              ? "bg-emerald-50 text-emerald-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <Icon size={16} className="text-slate-400 shrink-0" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {user?.role === "admin" && (
              <Link
                href="/admin"
                className="block w-full rounded-xl bg-amber-100 text-amber-900 px-4 py-3 text-sm font-semibold text-center hover:bg-amber-200"
              >
                Buka Panel Admin
              </Link>
            )}

            {user && (
              <button
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {loggingOut ? "Keluar…" : "Keluar dari akun"}
              </button>
            )}

            <div className="h-4" />
          </div>
        </div>
        </>
      )}
    </>
  );
}
