import { fetchResolvedMeta } from "@/lib/seo";

/**
 * Server component that injects per-route JSON-LD structured data resolved
 * from the backend. The underlying fetch is memoised within a request, so
 * pairing this with `generateMetadata` (which also calls the resolver) does
 * not double-hit the API.
 */
export async function SeoJsonLd({ path }: { path: string }) {
  const meta = await fetchResolvedMeta(path);
  const blocks = meta?.jsonLd;
  if (!blocks || blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON.stringify output is safe to embed in a ld+json script.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
