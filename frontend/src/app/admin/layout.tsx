"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  ClipboardList,
  Clock,
  Database,
  FileText,
  FormInput,
  Home,
  ImageIcon,
  KeyRound,
  MessageSquare,
  MessageSquareQuote,
  Menu,
  Mic,
  Search,
  ScrollText,
  Settings2,
  ShoppingBag,
  Sparkles,
  Tag,
  Users,
  X,
} from "lucide-react";
import { fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  group: string;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Home, group: "Overview", exact: true },
  { href: "/admin/users", label: "Pengguna", icon: Users, group: "Pengguna" },
  { href: "/admin/content/artikel", label: "Artikel", icon: FileText, group: "Konten" },
  { href: "/admin/serambi", label: "Serambi", icon: MessageSquareQuote, group: "Konten" },
  { href: "/admin/content/doa", label: "Doa", icon: ScrollText, group: "Konten" },
  { href: "/admin/content/topic", label: "Topik", icon: Tag, group: "Konten" },
  { href: "/admin/content/khutbah", label: "Khutbah", icon: Mic, group: "Konten" },
  { href: "/admin/content/hadis-qudsi", label: "Hadis Qudsi", icon: Sparkles, group: "Konten" },
  { href: "/admin/content/sirah", label: "Sirah", icon: BookOpen, group: "Konten" },
  { href: "/admin/content/nabi", label: "Kisah Nabi", icon: Users, group: "Konten" },
  { href: "/admin/content/asmaul-husna", label: "Asmaul Husna", icon: Sparkles, group: "Konten" },
  { href: "/admin/content/niat-shalat", label: "Niat Shalat", icon: ScrollText, group: "Konten" },
  { href: "/admin/content/bacaan-shalat", label: "Bacaan Shalat", icon: ScrollText, group: "Konten" },
  { href: "/admin/content/tahlil", label: "Tahlil", icon: ScrollText, group: "Konten" },
  { href: "/admin/content/sajdah", label: "Ayat Sajdah", icon: BookOpen, group: "Konten" },
  { href: "/admin/shop", label: "Toko", icon: ShoppingBag, group: "Toko", exact: true },
  { href: "/admin/shop/products", label: "Produk", icon: ShoppingBag, group: "Toko" },
  { href: "/admin/shop/categories", label: "Kategori", icon: Tag, group: "Toko" },
  { href: "/admin/shop/banners", label: "Banner", icon: ImageIcon, group: "Toko" },
  { href: "/admin/shop/orders", label: "Laporan Order", icon: ClipboardList, group: "Toko" },
  { href: "/admin/shop/form-builder", label: "Form Builder", icon: FormInput, group: "Toko" },
  { href: "/admin/shop/settings", label: "Setting Toko", icon: Settings2, group: "Toko" },
  { href: "/admin/broadcast", label: "Broadcast", icon: Bell, group: "Notifikasi" },
  { href: "/admin/cron", label: "Cron Jobs", icon: Clock, group: "Notifikasi" },
  { href: "/admin/feedback", label: "Masukan", icon: MessageSquare, group: "Dukungan" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, group: "Insights" },
  { href: "/admin/analytics/traffic", label: "Traffic Web", icon: BarChart3, group: "Insights" },
  { href: "/admin/analytics/api-traffic", label: "Traffic API", icon: BarChart3, group: "Insights" },
  { href: "/admin/audit", label: "Audit Log", icon: FileText, group: "Insights" },
  { href: "/admin/seo", label: "SEO", icon: Search, group: "Pengaturan" },
  { href: "/admin/settings/ai", label: "AI Settings", icon: Sparkles, group: "Pengaturan" },
  { href: "/admin/ai/queries", label: "AI Queries", icon: BarChart3, group: "Pengaturan" },
  { href: "/admin/ai/cost", label: "AI Cost", icon: BarChart3, group: "Pengaturan" },
  { href: "/admin/system", label: "System Health", icon: Activity, group: "Operasi" },
  { href: "/admin/api-keys", label: "API Keys", icon: KeyRound, group: "Operasi" },
  { href: "/admin/snapshots", label: "Snapshots", icon: Database, group: "Operasi" },
  { href: "/admin/seed", label: "Seed Control", icon: Boxes, group: "Operasi" },
  { href: "/admin/api-docs", label: "API Docs", icon: BookOpen, group: "Developer" },
];

/**
 * How strongly `item` matches `pathname`, as the length of the matched href
 * (or -1 for no match). Non-exact items match on a path boundary only so
 * `/admin/shop` does NOT match `/admin/shopfoo`. The nav highlights the single
 * item with the longest match, so a child route (e.g. /admin/shop/products)
 * wins over its parent (/admin/shop) instead of lighting up both.
 */
function matchLen(pathname: string, item: NavItem): number {
  if (item.exact) return pathname === item.href ? item.href.length : -1;
  if (pathname === item.href || pathname.startsWith(item.href + "/")) {
    return item.href.length;
  }
  return -1;
}

/** The href of the single best-matching nav item for the current path. */
function bestMatchHref(pathname: string): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const item of NAV) {
    const len = matchLen(pathname, item);
    if (len > bestLen) {
      bestLen = len;
      best = item.href;
    }
  }
  return best;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Badge counter: number of feedback still with status "baru". Only fetch
  // once the admin is authenticated; refresh every minute so a new submission
  // shows up without a manual reload.
  const isAdmin = !loading && user?.role === "admin";
  const { data: feedbackStats } = useSWR<{
    byStatus?: Record<string, number>;
  }>(isAdmin ? "/admin/feedback/stats" : null, fetcher, {
    refreshInterval: 60_000,
  });
  const feedbackBaru = feedbackStats?.byStatus?.baru ?? 0;
  const badgeFor = (href: string): number =>
    href === "/admin/feedback" ? feedbackBaru : 0;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/admin");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/");
    }
  }, [loading, user, router]);

  // Close the mobile drawer whenever the route changes (e.g. after tapping a
  // nav link) so it never lingers over the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer overlay is open.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  if (loading || !user) return <Spinner label="Memeriksa akses…" />;
  if (user.role !== "admin") return <Spinner label="Mengalihkan…" />;

  // Group items so the sidebar renders section headers.
  const grouped = NAV.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  // Single best-matching nav item — drives both the highlight and the compact
  // mobile bar label (longest matching href wins so e.g. /admin/shop/products
  // beats /admin/shop).
  const activeHref = bestMatchHref(pathname);
  const current = NAV.find((item) => item.href === activeHref);

  // Nav body shared by the desktop sidebar and the mobile drawer.
  const navBody = (
    <>
      <div className="flex items-center gap-2 px-3 py-2 mb-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
          <Settings2 size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Admin
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {user.nama ?? user.email}
          </p>
        </div>
      </div>

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="mb-3">
          <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {group}
          </p>
          {items.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.icon;
            const badge = badgeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                }`}
              >
                <Icon
                  size={16}
                  strokeWidth={active ? 2.5 : 2}
                  className="shrink-0"
                />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span
                    className={`ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                      active
                        ? "bg-white/25 text-white"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="border-t border-slate-200 mt-2 pt-2">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          ← Kembali ke app
        </Link>
      </div>
    </>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* Compact bar on small screens: opens the nav drawer + shows the
          current section so the user always knows where they are. */}
      <div className="lg:hidden mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Buka menu admin"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
            Admin
          </p>
          <p className="text-sm font-semibold text-slate-900 truncate">
            {current?.label ?? "Dashboard"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <aside className="hidden lg:block card p-3 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] overflow-y-auto">
          {navBody}
        </aside>
        <main className="min-w-0">{children}</main>
      </div>

      {/* Mobile slide-in drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85%] bg-white shadow-xl p-3 overflow-y-auto">
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Tutup menu"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            {navBody}
          </aside>
        </div>
      )}
    </div>
  );
}
