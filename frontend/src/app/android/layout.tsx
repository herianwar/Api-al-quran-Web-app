import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Rencana Aplikasi Android — Al-Qur'an Super App",
  description:
    "Roadmap lengkap & detail pembuatan aplikasi Android Al-Qur'an Super App: daftar fitur, arsitektur, tech stack, fase pengembangan, plus prompt siap pakai untuk Claude Design & Claude Code.",
  alternates: { canonical: "/android" },
  openGraph: {
    title: "Rencana Aplikasi Android — Al-Qur'an Super App",
    description:
      "Roadmap lengkap pembuatan aplikasi Android: fitur, arsitektur, fase, dan prompt siap pakai untuk Claude Design & Claude Code.",
    type: "website",
    url: "/android",
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
