"use client";

import {
  BookOpen,
  Compass,
  Heart,
  Moon,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Baca", icon: BookOpen },
  { href: "/doa", label: "Doa", icon: Heart },
  { href: "/hadis", label: "Hadis", icon: Compass },
  { href: "/sholat", label: "Sholat", icon: Moon },
  { href: "/toko", label: "Toko", icon: ShoppingBag },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;
  if (pathname === "/login" || pathname === "/register") return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Navigasi utama"
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-2px_12px_rgba(15,29,24,0.05)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5 max-w-md mx-auto">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 px-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "text-emerald-700"
                    : "text-slate-500 hover:text-emerald-700"
                }`}
              >
                <span
                  className={`grid h-7 w-12 place-items-center rounded-full transition-all ${
                    active ? "bg-emerald-50" : ""
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.5 : 2}
                    className="transition-transform"
                  />
                </span>
                <span className="tracking-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
