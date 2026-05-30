"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import type { ShopSettings } from "@/lib/types";
/* keep ShopSettings type for SWR generic */
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";

type SettingField = {
  key: string;
  label: string;
  hint: string;
  multiline?: boolean;
  select?: { value: string; label: string; desc: string }[];
  group: "Umum" | "Metode Order" | "WhatsApp" | "Form Order";
};

const KEYS: SettingField[] = [
  { key: "shop_title", label: "Judul toko", hint: "Tampil di hero /toko", group: "Umum" },
  {
    key: "shop_description",
    label: "Deskripsi toko",
    hint: "Subjudul di hero",
    multiline: true,
    group: "Umum",
  },
  {
    key: "order_mode",
    label: "Metode pemesanan",
    hint: "Pilih bagaimana pelanggan memesan produk.",
    group: "Metode Order",
    select: [
      {
        value: "wa",
        label: "WhatsApp",
        desc: "Tombol order membuka WhatsApp dengan pesan otomatis.",
      },
      {
        value: "form",
        label: "Form",
        desc: "Pelanggan mengisi form order dinamis di situs (kelola di Form Builder).",
      },
    ],
  },
  {
    key: "wa_number",
    label: "Nomor WhatsApp",
    hint: "Format 62812xxxxxxx (digits only, tanpa +). Contoh: 6281234567890",
    group: "WhatsApp",
  },
  {
    key: "wa_greeting",
    label: "Template pesan WhatsApp",
    hint:
      "Token: {salam} (auto pagi/siang/sore/malam), {produk} (nama), {harga} (Rp 125.000)",
    multiline: true,
    group: "WhatsApp",
  },
  {
    key: "form_submit_label",
    label: "Label tombol kirim",
    hint: "Teks tombol submit form order. Contoh: Kirim Pesanan",
    group: "Form Order",
  },
  {
    key: "form_success_message",
    label: "Pesan setelah order terkirim",
    hint: "Ditampilkan ke pelanggan setelah form order berhasil dikirim.",
    multiline: true,
    group: "Form Order",
  },
];

const GROUP_ORDER: SettingField["group"][] = [
  "Umum",
  "Metode Order",
  "WhatsApp",
  "Form Order",
];

export default function AdminShopSettingsPage() {
  const { data, error, isLoading, mutate } = useSWR<ShopSettings>(
    "/admin/shop/settings",
    fetcher,
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft({ ...data });
  }, [data]);

  async function save(key: string) {
    setSavingKey(key);
    setErr(null);
    try {
      await apiFetch(`/admin/shop/settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: draft[key] ?? "" }),
      });
      await mutate();
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/shop"
        className="inline-block text-sm text-emerald-700 hover:underline"
      >
        ← Toko
      </Link>
      <PageHeader
        title="Setting Toko"
        description="Metode pemesanan, nomor WhatsApp, template pesan, dan teks form."
      />

      {isLoading && <Spinner label="Memuat setting…" />}
      {error && <ErrorBox message={(error as Error).message} />}
      {err && <ErrorBox message={err} />}

      {GROUP_ORDER.map((group) => {
        const items = KEYS.filter((k) => k.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="space-y-4">
            <SectionHeader title={group} />
            {items.map((k) => (
              <div key={k.key} className="card p-5">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <label className="font-semibold text-slate-900 text-sm">
                    {k.label}
                  </label>
                  {savedKey === k.key && (
                    <span className="text-[10px] text-emerald-700 font-bold uppercase">
                      Tersimpan
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  {k.hint}
                </p>

                {k.select ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {k.select.map((opt) => {
                      const active = (draft[k.key] ?? "") === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({ ...d, [k.key]: opt.value }))
                          }
                          className={`text-left rounded-xl border p-3 transition ${
                            active
                              ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20"
                              : "border-slate-200 hover:border-emerald-300"
                          }`}
                        >
                          <span className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                            <span
                              className={`grid h-4 w-4 place-items-center rounded-full border ${
                                active
                                  ? "border-emerald-600 bg-emerald-600"
                                  : "border-slate-300"
                              }`}
                            >
                              {active && (
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              )}
                            </span>
                            {opt.label}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-500 leading-snug">
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : k.multiline ? (
                  <textarea
                    value={draft[k.key] ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [k.key]: e.target.value }))
                    }
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                ) : (
                  <input
                    value={draft[k.key] ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [k.key]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                )}

                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => save(k.key)}
                    disabled={
                      savingKey === k.key ||
                      draft[k.key] === (data?.[k.key] ?? "")
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Save size={14} />
                    {savingKey === k.key ? "Menyimpan…" : "Simpan"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
