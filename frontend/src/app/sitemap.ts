import type { MetadataRoute } from "next";
import { fetchSeoGlobals } from "@/lib/seo";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

interface Entry {
  path: string;
  lastModified?: string;
  changefreq?: string;
  priority?: number;
}

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
const FREQS: ChangeFreq[] = [
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const globals = await fetchSeoGlobals();
  const base = (globals?.siteUrl ?? "https://rumahquran.id").replace(/\/$/, "");

  let entries: Entry[] = [];
  try {
    const res = await fetch(`${API}/seo/sitemap`, {
      next: { revalidate: 900 },
      headers: {
        Accept: "application/json",
        ...(process.env.NEXT_PUBLIC_API_KEY
          ? { "x-api-key": process.env.NEXT_PUBLIC_API_KEY }
          : {}),
      },
    });
    if (res.ok) {
      const env = (await res.json()) as { data?: Entry[] };
      entries = env.data ?? [];
    }
  } catch {
    entries = [];
  }

  // Always include the homepage even if the API is unreachable.
  if (!entries.some((e) => e.path === "/")) {
    entries.unshift({ path: "/", changefreq: "daily", priority: 1 });
  }

  return entries.map((e) => ({
    url: `${base}${e.path === "/" ? "" : e.path}`,
    lastModified: e.lastModified ? new Date(e.lastModified) : undefined,
    changeFrequency: FREQS.includes(e.changefreq as ChangeFreq)
      ? (e.changefreq as ChangeFreq)
      : undefined,
    priority: typeof e.priority === "number" ? e.priority : undefined,
  }));
}
