"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Beranda" },
  { href: "/doa", label: "Doa" },
  { href: "/sholat", label: "Jadwal Sholat" },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-background/80 border-b border-emerald-900/10">
      <nav className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-emerald-700">
          <span className="text-xl">☪</span>
          <span>Al-Qur&apos;an</span>
        </Link>

        <div className="hidden sm:flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-emerald-600 text-white"
                  : "text-emerald-900/70 hover:bg-emerald-600/10"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              <Link
                href="/me"
                className="hidden sm:inline px-3 py-1.5 rounded-lg text-sm font-medium text-emerald-900/70 hover:bg-emerald-600/10"
              >
                {user.nama ?? user.email.split("@")[0]}
              </Link>
              <button
                onClick={() => logout()}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-emerald-600/30 hover:bg-emerald-600/10"
              >
                Keluar
              </button>
            </>
          ) : (
            !loading && (
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Masuk
              </Link>
            )
          )}
          <button
            className="sm:hidden p-2 rounded-lg hover:bg-emerald-600/10"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>
        </div>
      </nav>

      {open && (
        <div className="sm:hidden border-t border-emerald-900/10 px-4 py-2 flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                isActive(item.href)
                  ? "bg-emerald-600 text-white"
                  : "hover:bg-emerald-600/10"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {user && (
            <Link
              href="/me"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600/10"
            >
              Dashboard
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
