"use client";

import { List } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(s: string, i: number): string {
  const base = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "bagian"}-${i}`;
}

/**
 * Renders sanitized article HTML and, after mount, scans its <h2>/<h3>
 * headings to assign anchor ids and build a "Daftar Isi" (table of contents).
 * The TOC only appears when there are at least three headings.
 */
export function ArticleContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const heads = Array.from(el.querySelectorAll("h2, h3")) as HTMLElement[];
    const items: TocItem[] = heads.map((h, i) => {
      const text = h.textContent?.trim() || `Bagian ${i + 1}`;
      const id = h.id || slugify(text, i);
      h.id = id;
      // Offset scroll target below the sticky navbar.
      h.style.scrollMarginTop = "5rem";
      return { id, text, level: h.tagName === "H3" ? 3 : 2 };
    });
    setToc(items);

    // Harden external links (covers legacy content saved before the editor
    // added rel/target itself): open in a new tab, no referrer leak, nofollow.
    const links = Array.from(el.querySelectorAll("a[href]")) as HTMLAnchorElement[];
    for (const a of links) {
      const href = a.getAttribute("href") ?? "";
      const external = /^https?:\/\//i.test(href) && !href.includes(location.host);
      if (external) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer nofollow");
      }
    }
  }, [html]);

  const showToc = useMemo(() => toc.length >= 3, [toc]);

  return (
    <>
      {showToc && (
        <nav className="card mb-6 p-4 bg-emerald-50/40 border-emerald-100">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-emerald-800">
            <List size={15} /> Daftar Isi
          </p>
          <ul className="space-y-1">
            {toc.map((t) => (
              <li key={t.id} className={t.level === 3 ? "pl-4" : ""}>
                <a
                  href={`#${t.id}`}
                  className="text-sm text-slate-600 hover:text-emerald-700 hover:underline"
                >
                  {t.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div
        ref={ref}
        className="article-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
