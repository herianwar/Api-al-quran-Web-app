import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Al-Qur'an Super App",
  description:
    "Baca Al-Qur'an, dengarkan murottal, tafsir Kemenag, doa & dzikir, dan jadwal sholat. Lengkap dengan bookmark dan hafalan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <head>
        {/* Arabic font loaded in the browser (not at build time) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-emerald-900/10 py-6 text-center text-sm text-emerald-900/50">
            Al-Qur&apos;an Super App · Data: equran.id &amp; Quran.com
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
