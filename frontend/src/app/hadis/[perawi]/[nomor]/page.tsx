"use client";

import Link from "next/link";
import { use } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { Hadis } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";

export default function HadisDetailPage({
  params,
}: {
  params: Promise<{ perawi: string; nomor: string }>;
}) {
  const { perawi: perawiSlug, nomor } = use(params);
  const nomorNum = Number(nomor);

  const swr = useSWR<Hadis>(
    Number.isFinite(nomorNum) ? `/hadith/${perawiSlug}/${nomorNum}` : null,
    fetcher,
  );

  const data = swr.data;
  const perawi = data?.perawi;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/hadis/${perawiSlug}`}
        className="inline-block mb-4 text-sm text-emerald-700 hover:underline"
      >
        ← HR. {perawi?.nama ?? perawiSlug}
      </Link>

      {swr.isLoading && <Spinner label="Memuat hadis…" />}
      {swr.error && <ErrorBox message={(swr.error as Error).message} />}

      {data && (
        <article className="card p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-white font-bold tabular-nums">
              {data.nomor}
            </span>
            <div>
              <p className="text-xs text-slate-500">Hadis</p>
              <p className="font-semibold text-slate-900">
                HR. {perawi?.nama ?? perawiSlug} no. {data.nomor}
              </p>
            </div>
          </div>

          {data.arab && (
            <div className="mb-6 pb-6 border-b border-slate-100">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Teks Arab
              </p>
              <p className="arabic arabic-body text-right text-slate-900 leading-loose">
                {data.arab}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Terjemahan
            </p>
            <p className="text-[16px] leading-relaxed text-slate-800 whitespace-pre-wrap">
              {data.terjemahan}
            </p>
          </div>
        </article>
      )}

      {data && (
        <div className="flex items-center justify-between mt-6 gap-3">
          <Link
            href={`/hadis/${perawiSlug}/${Math.max(1, data.nomor - 1)}`}
            className={`px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition ${
              data.nomor <= 1 ? "pointer-events-none opacity-40" : ""
            }`}
          >
            ← No. {Math.max(1, data.nomor - 1)}
          </Link>
          <Link
            href={`/hadis/${perawiSlug}/${data.nomor + 1}`}
            className={`px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition ${
              perawi && data.nomor >= perawi.total ? "pointer-events-none opacity-40" : ""
            }`}
          >
            No. {data.nomor + 1} →
          </Link>
        </div>
      )}
    </div>
  );
}
