import Link from "next/link";
import type { ReactNode } from "react";

interface TocItem {
  id: string;
  label: string;
}

/**
 * Shared shell for static legal/policy pages (Kebijakan Privasi, Syarat &
 * Ketentuan). Server-component friendly — no client hooks. Renders a titled
 * header, an effective-date line, an anchored table of contents, and the body.
 */
export function LegalDoc({
  title,
  subtitle,
  effectiveDate,
  toc,
  children,
}: {
  title: string;
  subtitle?: string;
  effectiveDate: string;
  toc: TocItem[];
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10 space-y-6">
      <header className="space-y-2">
        <p className="section-eyebrow text-emerald-700">Dokumen Resmi</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && (
          <p className="text-slate-600 leading-relaxed">{subtitle}</p>
        )}
        <p className="text-sm text-slate-500">
          Berlaku efektif: <strong className="text-slate-700">{effectiveDate}</strong>
        </p>
      </header>

      <nav className="card p-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
          Daftar Isi
        </p>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {toc.map((t, i) => (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                className="text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                {i + 1}. {t.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="legal-body space-y-8 text-slate-700 leading-relaxed">
        {children}
      </article>

      <footer className="border-t border-slate-200 pt-6 text-sm text-slate-500 space-y-2">
        <p>
          Lihat juga:{" "}
          <Link href="/privacy" className="text-emerald-700 hover:underline">
            Kebijakan Privasi
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="text-emerald-700 hover:underline">
            Syarat &amp; Ketentuan
          </Link>
        </p>
        <p>© {new Date().getFullYear()} Rumah Qur&apos;an.</p>
      </footer>
    </div>
  );
}

/** A numbered section with an anchor target matching its TOC entry. */
export function LegalSection({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-bold text-slate-900">
        <span className="text-emerald-600">{index}.</span> {title}
      </h2>
      {children}
    </section>
  );
}
