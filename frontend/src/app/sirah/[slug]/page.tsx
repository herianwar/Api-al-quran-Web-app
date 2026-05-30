"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface SirahDetail {
  id: number;
  slug: string;
  judul: string;
  urutan: number;
  periode: string | null;
  isi: string;
}

function renderRich(text: string): React.ReactNode[] {
  return text.split(/\n\n+/).map((para, i) => {
    const parts = para.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
    return (
      <p
        key={i}
        className="text-slate-700 leading-relaxed whitespace-pre-wrap"
      >
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

export default function SirahDetailPage() {
  const params = useParams<{ slug: string }>();
  const { data, error, isLoading } = useSWR<SirahDetail>(
    `/sirah/${params.slug}`,
    fetcher,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <Link
        href="/sirah"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-700"
      >
        <ArrowLeft size={14} /> Kembali ke daftar bab
      </Link>

      {error && <ErrorBox message="Bab sirah tidak ditemukan" />}
      {isLoading && <Skeleton className="h-96 rounded-2xl" />}

      {data && (
        <article className="space-y-5">
          <header>
            <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">
              Bab {data.urutan}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
              {data.judul}
            </h1>
            {data.periode && (
              <p className="text-sm text-slate-500 mt-1">{data.periode}</p>
            )}
          </header>
          <section className="card p-6 space-y-3">
            {renderRich(data.isi)}
          </section>
        </article>
      )}
    </div>
  );
}
