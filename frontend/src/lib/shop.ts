import type { ShopProduct, ShopSettings } from "./types";

/** Format an IDR integer like 125000 as "Rp 125.000". */
export function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Resolve a product image URL — backend may return a path like
 * "/uploads/shop/abc.jpg" which the API itself serves; we prepend the
 * API origin so the browser fetches correctly cross-origin. */
export function resolveImage(url: string, apiOrigin: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) {
    // API_URL ends with /api/v1; we want the origin only.
    const origin = apiOrigin.replace(/\/api\/v\d+\/?$/, "");
    return `${origin}${url}`;
  }
  return url;
}

/** Build a wa.me URL with a pre-filled greeting message. Greeting template
 * supports tokens {salam}, {produk}, {harga}. Salam auto-picks based on hour. */
export function buildWaLink(
  product: ShopProduct,
  settings: Pick<ShopSettings, "wa_number" | "wa_greeting">,
): string | null {
  const number = product.waNumber || settings.wa_number;
  if (!number) return null;
  const salam = pickSalam();
  const greeting = (settings.wa_greeting || "Assalamu'alaikum, saya tertarik dengan {produk}")
    .replaceAll("{salam}", salam)
    .replaceAll("{produk}", product.nama)
    .replaceAll("{harga}", formatIdrPlain(product.hargaIdr));
  return `https://wa.me/${number}?text=${encodeURIComponent(greeting)}`;
}

function formatIdrPlain(amount: number): string {
  return amount.toLocaleString("id-ID");
}

function pickSalam(): string {
  const h = new Date().getHours();
  if (h < 4) return "Assalamu'alaikum";
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}
