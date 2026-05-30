"use client";

import { ArrowLeft, Calendar, Tag } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface KhutbahDetail {
  id: number;
  slug: string;
  judul: string;
  tema: string | null;
  tanggal: string | null;
  pembuka: string | null;
  isi: string;
  penutup: string | null;
  sumber: string | null;
}

function renderMarkdownLite(text: string): React.ReactNode[] {
  // Very small renderer: paragraphs separated by blank line, **bold** spans.
  return text.split(/\n\n+/).map((para, i) => {
    const parts = para.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
    return (
      <p key={i} className="text-slate-700 leading-relaxed whitespace-pre-wrap">
        {parts.map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**")) {
            return (
              <strong key={j} className="text-slate-900 font-semibold">
                {p.slice(2, -2)}
              </strong>
            );
          }
          if (p.startsWith("*") && p.endsWith("*")) {
            return <em key={j}>{p.slice(1, -1)}</em>;
          }
          return p;
        })}
      </p>
    );
  });
}

export default function KhutbahDetailPage() {
  const params = useParams<{ slug: string }>();
  const { data, error, isLoading } = useSWR<KhutbahDetail>(
    `/khutbah/${params.slug}`,
    fetcher,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <Link
        href="/khutbah"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-700"
      >
        <ArrowLeft size={14} /> Kembali ke daftar
      </Link>

      {error && <ErrorBox message="Khutbah tidak ditemukan" />}
      {isLoading && <Skeleton className="h-96 rounded-2xl" />}

      {data && (
        <article className="space-y-5">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {data.judul}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {data.tema && (
                <span className="inline-flex items-center gap-1 capitalize px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <Tag size={11} /> {data.tema}
                </span>
              )}
              {data.tanggal && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(data.tanggal).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
              {data.sumber && <span>· {data.sumber}</span>}
            </div>
          </header>

          {data.pembuka && (
            <section className="card bg-amber-50 border-amber-100 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">
                Pembuka
              </h2>
              <div className="space-y-2">{renderMarkdownLite(data.pembuka)}</div>
            </section>
          )}

          <section className="card p-6 space-y-3">
            {renderMarkdownLite(data.isi)}
          </section>

          {data.penutup && (
            <section className="card bg-emerald-50 border-emerald-100 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                Penutup
              </h2>
              <p className="arabic text-lg leading-loose text-emerald-900 text-right">
                {data.penutup}
              </p>
            </section>
          )}
        </article>
      )}
    </div>
  );
}
