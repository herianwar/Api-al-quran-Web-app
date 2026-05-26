"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { JadwalSholat, Kota } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";

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

export default function SholatPage() {
  const [provinsi, setProvinsi] = useState("");
  const [kotaId, setKotaId] = useState("");

  const { data: provinsiList, error: provErr } = useSWR<string[]>(
    "/sholat/provinsi",
    fetcher,
    { shouldRetryOnError: false },
  );
  const { data: kotaList } = useSWR<Kota[]>(
    provinsi ? `/sholat/kota?provinsi=${encodeURIComponent(provinsi)}` : null,
    fetcher,
  );
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
      <h1 className="text-2xl font-bold mb-1">Jadwal Sholat</h1>
      <p className="text-emerald-900/60 text-sm mb-5">
        Pilih provinsi dan kota untuk melihat jadwal sholat hari ini.
      </p>

      {provErr && (
        <ErrorBox message="Daftar kota belum tersedia (butuh koneksi ke sumber data di backend)." />
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <select
          value={provinsi}
          onChange={(e) => {
            setProvinsi(e.target.value);
            setKotaId("");
          }}
          className="rounded-xl border border-emerald-900/15 bg-white/70 px-3 py-2.5 text-sm"
        >
          <option value="">Pilih provinsi…</option>
          {provinsiList?.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={kotaId}
          onChange={(e) => setKotaId(e.target.value)}
          disabled={!provinsi}
          className="rounded-xl border border-emerald-900/15 bg-white/70 px-3 py-2.5 text-sm disabled:opacity-50"
        >
          <option value="">Pilih kota…</option>
          {kotaList?.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nama}
            </option>
          ))}
        </select>
      </div>

      {loadingToday && <Spinner label="Memuat jadwal…" />}
      {todayErr && kotaId && (
        <ErrorBox message="Jadwal tidak tersedia untuk kota ini." />
      )}

      {today && (
        <section className="rounded-3xl border border-emerald-900/10 bg-white/60 p-6">
          <div className="text-center mb-5">
            <h2 className="text-lg font-bold text-emerald-800">
              {today.namaKota}
            </h2>
            <p className="text-sm text-emerald-900/60">
              {new Date(today.tanggal).toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PRAYERS.map((p) => (
              <div
                key={p.key}
                className="rounded-xl bg-emerald-600/5 border border-emerald-600/15 p-3 text-center"
              >
                <p className="text-xs text-emerald-900/60">{p.label}</p>
                <p className="text-lg font-bold text-emerald-800">
                  {String(today[p.key])}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
