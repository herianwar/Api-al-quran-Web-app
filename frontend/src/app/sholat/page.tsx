"use client";

import { Clock, MapPin, Search, Sunrise } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { JadwalSholat, Kota } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

const PRAYERS: { key: keyof JadwalSholat; label: string }[] = [
  { key: "imsak", label: "Imsak" },
  { key: "subuh", label: "Subuh" },
  { key: "terbit", label: "Terbit" },
  { key: "dhuha", label: "Dhuha" },
  { key: "dzuhur", label: "Dzuhur" },
  { key: "ashar", label: "Ashar" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isya", label: "Isya" },
];

const STORAGE_KEY = "rumahquran:sholat:kotaId";

export default function SholatPage() {
  const [search, setSearch] = useState("");
  const [kotaId, setKotaId] = useState<string>("");
  const [open, setOpen] = useState(false);

  // Restore last selection on mount (localStorage, client-only).
  useEffect(() => {
    const saved = typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;
    if (saved) setKotaId(saved);
  }, []);

  // Persist selection.
  useEffect(() => {
    if (kotaId && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, kotaId);
    }
  }, [kotaId]);

  // One request fetches all 518 kota — feed is cached server-side, payload
  // is tiny (~40KB) and lets us do instant client-side fuzzy search.
  const { data: kotaList, error: kotaErr, isLoading: loadingKota } = useSWR<
    Kota[]
  >("/sholat/kota", fetcher, { revalidateOnFocus: false });

  const selectedKota = useMemo(
    () => kotaList?.find((k) => k.id === kotaId),
    [kotaList, kotaId],
  );

  const filteredKota = useMemo(() => {
    if (!kotaList) return [];
    const q = search.trim().toLowerCase();
    if (!q) return kotaList.slice(0, 50);
    return kotaList
      .filter((k) => k.nama.toLowerCase().includes(q))
      .slice(0, 50);
  }, [kotaList, search]);

  const {
    data: today,
    error: todayErr,
    isLoading: loadingToday,
  } = useSWR<JadwalSholat>(
    kotaId ? `/sholat/${kotaId}/hari-ini` : null,
    fetcher,
    { shouldRetryOnError: false },
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <Sunrise size={22} />
        </span>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Jadwal Sholat
          </h1>
          <p className="text-sm text-slate-500">
            518 kota di Indonesia · data Kemenag (via myquran)
          </p>
        </div>
      </div>

      {/* Kota picker */}
      <div className="mt-6 mb-6 fade-in-up">
        <label className="section-eyebrow mb-2 flex">
          <MapPin size={12} /> Kota kamu
        </label>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            placeholder={
              selectedKota
                ? `${selectedKota.nama} (ketik untuk ganti)`
                : "Cari kota… (mis. Jakarta, Surabaya, Bandung)"
            }
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
          />
        </div>

        {open && (kotaList?.length ?? 0) > 0 && (
          <div className="relative">
            <div className="absolute top-2 inset-x-0 z-20 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {filteredKota.length === 0 ? (
                <p className="p-4 text-sm text-slate-500 text-center">
                  Tidak ada kota cocok dengan &ldquo;{search}&rdquo;.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredKota.map((k) => (
                    <li key={k.id}>
                      <button
                        onClick={() => {
                          setKotaId(k.id);
                          setSearch("");
                          setOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition flex items-center justify-between gap-3 ${
                          k.id === kotaId
                            ? "bg-emerald-50 text-emerald-800 font-semibold"
                            : "text-slate-700"
                        }`}
                      >
                        <span className="truncate">{k.nama}</span>
                        {k.id === kotaId && (
                          <span className="text-[10px] uppercase tracking-wider text-emerald-600">
                            terpilih
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => setOpen(false)}
                className="block w-full text-center py-2 text-xs text-slate-500 hover:bg-slate-50 border-t border-slate-100"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {kotaErr && (
          <ErrorBox message="Gagal memuat daftar kota. Backend belum punya data — coba refresh atau periksa /admin/seed." />
        )}
        {loadingKota && (
          <div className="mt-3 space-y-2">
            <Skeleton width="100%" height={44} />
            <Skeleton width="80%" height={14} />
          </div>
        )}
      </div>

      {!kotaId && !loadingKota && (
        <div className="card p-8 text-center">
          <p className="text-3xl mb-2">🕌</p>
          <p className="text-sm text-slate-600">
            Pilih kota di atas untuk lihat jadwal sholat hari ini.
          </p>
        </div>
      )}

      {loadingToday && kotaId && (
        <section className="card p-6 sm:p-8">
          <div className="text-center mb-6 space-y-2">
            <Skeleton width="50%" height={28} className="mx-auto" />
            <Skeleton width="70%" height={14} className="mx-auto" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PRAYERS.map((_, i) => (
              <Skeleton key={i} height={92} rounded="xl" />
            ))}
          </div>
        </section>
      )}

      {todayErr && kotaId && (
        <ErrorBox message="Jadwal tidak tersedia untuk kota ini hari ini." />
      )}

      {today && (
        <section className="card p-6 sm:p-8 fade-in-up">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">
              {today.namaKota}
            </h2>
            <p className="text-sm text-slate-500 inline-flex items-center gap-1.5 justify-center">
              <Clock size={13} />
              {new Date(today.tanggal).toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PRAYERS.map((p) => {
              const v = today[p.key];
              const value =
                v === null || v === undefined || v === "" ? "—" : String(v);
              return (
                <div
                  key={p.key}
                  className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-4 text-center"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700/80 mb-1.5">
                    {p.label}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {value}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
