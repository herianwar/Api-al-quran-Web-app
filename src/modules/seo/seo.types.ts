/**
 * Shared SEO types. `ResolvedMeta` is the contract the frontend consumes from
 * `GET /seo/resolve?path=…` to drive Next.js `generateMetadata`. Keep it flat
 * and JSON-serialisable.
 */

/** Global SEO settings, read from app_settings (category "seo"). */
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

/** Fully merged metadata for a single route, ready for the frontend. */
export interface ResolvedMeta {
  path: string;
  /** Final <title> text (title template already applied). */
  title: string;
  description: string;
  keywords: string;
  /** Absolute canonical URL. */
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  /** Absolute OG image URL. */
  ogImage: string;
  ogType: string;
  siteName: string;
  locale: string;
  twitterCard: string;
  twitterHandle: string;
  facebookAppId: string;
  noindex: boolean;
  /** JSON-LD structured data objects to inject, or null. */
  jsonLd: Record<string, unknown>[] | null;
  /** Where the bulk of the metadata came from — for the admin preview. */
  source: 'override' | 'template' | 'default';
}

/** A single entry in the sitemap, produced by the backend and rendered to
 * XML by the Next.js `sitemap.ts` route. `path` is origin-relative. */
export interface SitemapEntry {
  path: string;
  lastModified?: string;
  changefreq?: string;
  priority?: number;
}

/** Robots policy, rendered to robots.txt by the Next.js `robots.ts` route. */
export interface RobotsPolicy {
  indexable: boolean;
  disallow: string[];
  sitemap: string;
  host: string;
  extra: string;
}

/** Intermediate per-route template metadata (before globals/override merge). */
export interface RouteTemplate {
  title?: string;
  description?: string;
  keywords?: string;
  ogType?: string;
  ogImage?: string;
  jsonLd?: Record<string, unknown>[];
  /** True for the homepage — title template is NOT applied. */
  isHome?: boolean;
  /** True when no template matched (unknown route) — falls back to globals. */
  isFallback?: boolean;
}
