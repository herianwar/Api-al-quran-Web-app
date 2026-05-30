import type { MetadataRoute } from "next";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

interface Policy {
  indexable: boolean;
  disallow: string[];
  sitemap: string;
  host: string;
  extra: string;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  let policy: Policy | null = null;
  try {
    const res = await fetch(`${API}/seo/robots`, {
      next: { revalidate: 900 },
      headers: {
        Accept: "application/json",
        ...(process.env.NEXT_PUBLIC_API_KEY
          ? { "x-api-key": process.env.NEXT_PUBLIC_API_KEY }
          : {}),
      },
    });
    if (res.ok) {
      const env = (await res.json()) as { data?: Policy };
      policy = env.data ?? null;
    }
  } catch {
    policy = null;
  }

  const base = (policy?.host ?? "https://rumahquran.id").replace(/\/$/, "");

  // When the site is globally set to non-indexable, block everything.
  if (policy && !policy.indexable) {
    return {
      rules: { userAgent: "*", disallow: "/" },
      sitemap: `${base}/sitemap.xml`,
      host: base,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: policy?.disallow ?? ["/admin", "/me", "/login", "/register", "/api"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
