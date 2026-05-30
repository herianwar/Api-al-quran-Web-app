"use client";

import { Activity, BarChart3, BookOpen, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/admin/analytics", label: "Overview", icon: BarChart3, exact: true },
  { href: "/admin/analytics/users", label: "Users", icon: Users },
  { href: "/admin/analytics/content", label: "Content", icon: BookOpen },
  {
    href: "/admin/analytics/engagement",
    label: "Engagement",
    icon: Activity,
  },
  { href: "/admin/analytics/search", label: "Search", icon: Search },
];

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <nav className="card p-1.5 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                active
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
              }`}
            >
              <Icon size={14} strokeWidth={active ? 2.5 : 2} />
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
