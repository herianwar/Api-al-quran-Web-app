import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { BottomNav } from "@/components/BottomNav";
import { Navbar } from "@/components/Navbar";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { buildRootMetadata } from "@/lib/seo";

export function generateMetadata(): Promise<Metadata> {
  return buildRootMetadata();
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <head>
        {/* Arabic typography is self-hosted in /fonts/ — see globals.css
            @font-face declarations. No external font CDN at runtime. */}
        <link
          rel="preload"
          href="/fonts/amiri-quran-arabic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Site-wide Organization / WebSite structured data (from /). */}
        <SeoJsonLd path="/" />
      </head>
      <body className="min-h-full flex flex-col pb-[68px] sm:pb-0">
        <AuthProvider>
          <AnalyticsTracker />
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-slate-200 bg-white/60 py-6 text-center text-sm text-slate-500">
            © {new Date().getFullYear()} Rumah Qur&apos;an · Bacaan,
            tafsir, doa & ibadah harian dalam satu tempat.
          </footer>
          <BottomNav />
        </AuthProvider>
        <SiteAnalytics />
      </body>
    </html>
  );
}
