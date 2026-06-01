import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SeoJsonLd } from "@/components/SeoJsonLd";

type Params = Promise<{ slug: string }>;

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

interface ArtikelMeta {
  judul: string;
  ringkasan?: string | null;
  coverUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  penulis?: string | null;
  tags?: string[];
}

/** Fetch the article's own SEO fields (server-side, revalidated). */
async function fetchArtikel(slug: string): Promise<ArtikelMeta | null> {
  try {
    const res = await fetch(`${API}/artikel/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
      headers: {
        Accept: "application/json",
        ...(process.env.NEXT_PUBLIC_API_KEY
          ? { "x-api-key": process.env.NEXT_PUBLIC_API_KEY }
          : {}),
      },
    });
    if (!res.ok) return null;
    const env = (await res.json()) as { data?: ArtikelMeta };
    return env.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  // Base metadata carries site-wide config (canonical, siteName, twitter…).
  const base = await buildMetadata(`/artikel/${slug}`);
  const a = await fetchArtikel(slug);
  if (!a) return base;

  // The article's own fields win, falling back to its content.
  const title = (a.metaTitle || a.judul || "").trim();
  const description = (a.metaDescription || a.ringkasan || "").trim();
  const image = a.ogImage || a.coverUrl || undefined;

  // Pull site-wide bits off the base OG without inheriting its union type
  // (so we can safely emit an "article" OpenGraph with article-only fields).
  const bog = base.openGraph as
    | { url?: string | URL; siteName?: string; locale?: string }
    | undefined;
  const btw = base.twitter as { site?: string; creator?: string; card?: string } | undefined;

  return {
    ...base,
    title: title ? { absolute: title } : base.title,
    description: description || base.description,
    openGraph: {
      type: "article",
      title: title || undefined,
      description: description || undefined,
      url: bog?.url,
      siteName: bog?.siteName,
      locale: bog?.locale,
      publishedTime: a.publishedAt ?? undefined,
      modifiedTime: a.updatedAt ?? undefined,
      authors: a.penulis ? [a.penulis] : undefined,
      tags: a.tags && a.tags.length ? a.tags : undefined,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card:
        (btw?.card as "summary" | "summary_large_image") ||
        "summary_large_image",
      title: title || undefined,
      description: description || undefined,
      site: btw?.site,
      creator: btw?.creator,
      images: image ? [image] : undefined,
    },
  };
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { slug } = await params;
  return (
    <>
      <SeoJsonLd path={`/artikel/${slug}`} />
      {children}
    </>
  );
}
