import type { Metadata } from "next";

// Base URL of the NestJS API. Works on both server (generateMetadata,
// sitemap, robots) and never runs in the browser for these helpers.
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

// Revalidate SEO data every 5 minutes — admin edits propagate quickly without
// hammering the backend on every request.
const REVALIDATE = 300;

export interface ResolvedMeta {
  path: string;
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
  siteName: string;
  locale: string;
  twitterCard: string;
  twitterHandle: string;
  facebookAppId: string;
  noindex: boolean;
  jsonLd: Record<string, unknown>[] | null;
  source: "override" | "template" | "default";
}

export interface SeoGlobals {
  siteUrl: string;
  siteName: string;
  defaultTitle: string;
  titleTemplate: string;
  defaultDescription: string;
  defaultKeywords: string;
  defaultOgImage: string;
  twitterHandle: string;
  twitterCard: string;
  facebookAppId: string;
  locale: string;
  googleSiteVerification: string;
  bingSiteVerification: string;
  gaMeasurementId: string;
  gtmId: string;
  indexable: boolean;
  robotsExtra: string;
  organizationName: string;
  organizationLogo: string;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      next: { revalidate: REVALIDATE },
      headers: {
        Accept: "application/json",
        ...(process.env.NEXT_PUBLIC_API_KEY
          ? { "x-api-key": process.env.NEXT_PUBLIC_API_KEY }
          : {}),
      },
    });
    if (!res.ok) return null;
    const env = (await res.json()) as { data?: T };
    return env.data ?? null;
  } catch {
    return null;
  }
}

export function fetchSeoGlobals(): Promise<SeoGlobals | null> {
  return getJson<SeoGlobals>("/seo/globals");
}

export function fetchResolvedMeta(path: string): Promise<ResolvedMeta | null> {
  return getJson<ResolvedMeta>(`/seo/resolve?path=${encodeURIComponent(path)}`);
}

/**
 * Resolve a route's metadata from the backend and shape it into a Next.js
 * `Metadata` object. Used by per-route `generateMetadata` exports. Falls back
 * to a bare title if the backend is unreachable so pages never crash.
 */
export async function buildMetadata(path: string): Promise<Metadata> {
  const m = await fetchResolvedMeta(path);
  if (!m) return {};

  const robots = m.noindex
    ? { index: false, follow: false }
    : { index: true, follow: true };

  // Next's typed Metadata API only accepts a fixed set of OpenGraph types;
  // anything else (e.g. the shop's "product") throws "Invalid OpenGraph type"
  // and crashes the whole server render. The richer product data is already
  // emitted as JSON-LD by <SeoJsonLd>, so we safely coerce any unsupported
  // type down to "website" for the og:type tag.
  const OG_TYPES = new Set(["website", "article", "book", "profile"]);
  const ogType = (
    m.ogType && OG_TYPES.has(m.ogType) ? m.ogType : "website"
  ) as "website" | "article" | "book" | "profile";

  return {
    // Backend already applied the title template; use absolute to avoid
    // double-templating against the root layout's template.
    title: { absolute: m.title },
    description: m.description,
    keywords: m.keywords || undefined,
    alternates: { canonical: m.canonical },
    robots,
    openGraph: {
      title: m.ogTitle,
      description: m.ogDescription,
      url: m.canonical,
      siteName: m.siteName,
      locale: m.locale,
      type: ogType,
      images: m.ogImage ? [{ url: m.ogImage }] : undefined,
    },
    twitter: {
      card: (m.twitterCard as "summary" | "summary_large_image") || "summary_large_image",
      title: m.ogTitle,
      description: m.ogDescription,
      site: m.twitterHandle || undefined,
      creator: m.twitterHandle || undefined,
      images: m.ogImage ? [m.ogImage] : undefined,
    },
  };
}

/** Convenience for static routes — `generateMetadata = seoFor("/doa")`. */
export function seoFor(path: string): () => Promise<Metadata> {
  return () => buildMetadata(path);
}

/**
 * Site-wide default metadata for the root layout, built from the global SEO
 * settings. Per-route layouts override the specific fields they care about.
 */
export async function buildRootMetadata(): Promise<Metadata> {
  const g = await fetchSeoGlobals();
  if (!g) {
    return { title: "Rumah Qur'an" };
  }
  let metadataBase: URL | undefined;
  try {
    metadataBase = new URL(g.siteUrl);
  } catch {
    metadataBase = undefined;
  }

  return {
    metadataBase,
    title: { default: g.defaultTitle, template: g.titleTemplate },
    description: g.defaultDescription,
    keywords: g.defaultKeywords || undefined,
    applicationName: g.siteName,
    robots: g.indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      siteName: g.siteName,
      locale: g.locale,
      type: "website",
      url: g.siteUrl,
      title: g.defaultTitle,
      description: g.defaultDescription,
      images: g.defaultOgImage ? [{ url: g.defaultOgImage }] : undefined,
    },
    twitter: {
      card: (g.twitterCard as "summary" | "summary_large_image") || "summary_large_image",
      title: g.defaultTitle,
      description: g.defaultDescription,
      site: g.twitterHandle || undefined,
      creator: g.twitterHandle || undefined,
      images: g.defaultOgImage ? [g.defaultOgImage] : undefined,
    },
    facebook: g.facebookAppId ? { appId: g.facebookAppId } : undefined,
    verification: {
      google: g.googleSiteVerification || undefined,
      other: g.bingSiteVerification
        ? { "msvalidate.01": g.bingSiteVerification }
        : undefined,
    },
  };
}
