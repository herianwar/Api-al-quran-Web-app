"use client";

import { Check, Loader2, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { formatIdr } from "@/lib/shop";
import type {
  ShopOrderField,
  ShopProduct,
  ShopSettings,
} from "@/lib/types";

interface Props {
  product: ShopProduct;
  settings: Pick<ShopSettings, "form_success_message" | "form_submit_label">;
}

interface SubmitResult {
  orderNumber: string;
  status: string;
  message: string;
}

/** Order CTA for shops running in `order_mode = "form"`. Renders a button
 * that opens a modal with the admin-configured dynamic fields, validates
 * client-side, and POSTs to /shop/orders. */
export function OrderForm({ product, settings }: Props) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<SubmitResult | null>(null);

  const { data: fields, isLoading } = useSWR<ShopOrderField[]>(
    open ? "/shop/order-fields" : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const total = useMemo(() => product.hargaIdr * qty, [product.hargaIdr, qty]);

  function setField(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function reset() {
    setOpen(false);
    setErr(null);
    setDone(null);
    setValues({});
    setQty(1);
  }

  async function submit() {
    if (!fields) return;
    // Client-side required check for instant feedback (server re-validates).
    for (const f of fields) {
      if (f.required && !(values[f.key] ?? "").trim()) {
        setErr(`Field "${f.label}" wajib diisi.`);
        return;
      }
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch<SubmitResult>("/shop/orders", {
        method: "POST",
        body: JSON.stringify({
          productSlug: product.slug,
          quantity: qty,
          fields: values,
        }),
      });
      setDone(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengirim pesanan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3.5 text-base shadow-sm transition mb-6"
      >
        <ShoppingBag size={18} />
        Pesan Sekarang
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full my-8 max-h-[calc(100vh-4rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
              <div className="min-w-0">
                <h2 className="font-bold text-lg text-slate-900 leading-tight">
                  {done ? "Pesanan Terkirim" : "Form Pemesanan"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                  {product.nama}
                </p>
              </div>
              <button
                onClick={reset}
                aria-label="Tutup"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            {done ? (
              <div className="p-6 text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check size={28} strokeWidth={3} />
                </div>
                <p className="text-sm text-slate-700 leading-relaxed mb-3">
                  {done.message}
                </p>
                <p className="text-xs text-slate-500">No. Pesanan</p>
                <p className="font-mono font-bold text-emerald-700 text-lg tracking-wide mb-5">
                  {done.orderNumber}
                </p>
                <button
                  onClick={reset}
                  className="rounded-xl bg-emerald-600 text-white font-semibold px-6 py-2.5 text-sm hover:bg-emerald-700"
                >
                  Selesai
                </button>
              </div>
            ) : (
              <>
                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto">
                  {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                      <Loader2 size={16} className="animate-spin" /> Memuat
                      form…
                    </div>
                  )}

                  {fields && fields.length === 0 && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      Form pemesanan belum dikonfigurasi. Silakan hubungi admin.
                    </p>
                  )}

                  {/* Quantity */}
                  <div>
                    <span className="text-xs font-semibold text-slate-600">
                      Jumlah
                    </span>
                    <div className="mt-1 flex items-center gap-3">
                      <div className="inline-flex items-center rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                          disabled={qty <= 1}
                          aria-label="Kurangi"
                        >
                          <Minus size={15} />
                        </button>
                        <span className="w-10 text-center text-sm font-semibold tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.min(999, q + 1))}
                          className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50"
                          aria-label="Tambah"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <span className="text-sm text-slate-500">
                        Total{" "}
                        <span className="font-bold text-emerald-700">
                          {formatIdr(total)}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Dynamic fields */}
                  {fields?.map((f) => (
                    <label key={f.id} className="block">
                      <span className="text-xs font-semibold text-slate-600">
                        {f.label}
                        {f.required && (
                          <span className="text-rose-500 ml-0.5">*</span>
                        )}
                      </span>
                      {renderField(f, values[f.key] ?? "", (v) =>
                        setField(f.key, v),
                      )}
                      {f.helpText && (
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {f.helpText}
                        </span>
                      )}
                    </label>
                  ))}

                  {err && (
                    <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">
                      {err}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    onClick={reset}
                    disabled={busy}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy || isLoading || (fields?.length ?? 0) === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busy && <Loader2 size={15} className="animate-spin" />}
                    {busy
                      ? "Mengirim…"
                      : settings.form_submit_label || "Kirim Pesanan"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const INPUT_CLS =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function renderField(
  field: ShopOrderField,
  value: string,
  onChange: (v: string) => void,
) {
  switch (field.type) {
    case "textarea":
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          rows={3}
          className={INPUT_CLS}
        />
      );
    case "select":
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">— Pilih —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          type={inputType(field.type)}
          inputMode={
            field.type === "tel"
              ? "tel"
              : field.type === "number"
                ? "numeric"
                : undefined
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          className={INPUT_CLS}
        />
      );
  }
}

function inputType(type: ShopOrderField["type"]): string {
  switch (type) {
    case "email":
      return "email";
    case "tel":
      return "tel";
    case "number":
      return "number";
    default:
      return "text";
  }
}
