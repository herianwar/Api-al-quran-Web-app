"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Captions,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, tokenStore } from "@/lib/api";

interface Props {
  value: string;
  onChange: (html: string) => void;
  /** Endpoint used for inline image uploads; returns { url }. */
  uploadPath?: string;
  placeholder?: string;
}

type Align = "left" | "center" | "right";

/**
 * Lightweight Word-like WYSIWYG editor built on a `contentEditable` surface +
 * `document.execCommand`. Dependency-free; emits sanitizable HTML the backend
 * stores verbatim. Extras over a bare editor:
 *  • paste is cleaned (strips MS-Word / web inline styles, classes, junk tags)
 *  • a block dropdown reflects & sets the current block (paragraph/H2/H3/quote)
 *  • clicking an image opens a popover to align it (left/center/right), toggle
 *    a caption, or delete it.
 */
export function RichTextEditor({
  value,
  onChange,
  uploadPath = "/admin/artikel/upload",
  placeholder = "Tulis artikel di sini… gunakan toolbar untuk format, judul, gambar, dan tautan.",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [block, setBlock] = useState("p");
  // Floating image toolbar state.
  const [imgSel, setImgSel] = useState<{ top: number; left: number } | null>(
    null,
  );
  const imgElRef = useRef<HTMLImageElement | null>(null);

  // Seed / re-seed innerHTML from `value` only when it diverges and the editor
  // isn't being typed into (prevents caret jumps mid-edit).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!focused && el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value, focused]);

  const emit = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  const syncBlock = useCallback(() => {
    try {
      const b = document.queryCommandValue("formatBlock");
      setBlock((b || "p").toLowerCase().replace(/[<>]/g, ""));
    } catch {
      /* not focused */
    }
  }, []);

  const exec = useCallback(
    (command: string, arg?: string) => {
      ref.current?.focus();
      document.execCommand(command, false, arg);
      emit();
      syncBlock();
    },
    [emit, syncBlock],
  );

  const applyBlock = useCallback(
    (tag: string) => exec("formatBlock", `<${tag}>`),
    [exec],
  );

  const addLink = useCallback(() => {
    const url = window.prompt("Masukkan URL tautan:", "https://");
    if (!url) return;
    exec("createLink", url);
  }, [exec]);

  // ── Paste cleanup ──────────────────────────────────────────────────────
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const html = e.clipboardData.getData("text/html");
      const text = e.clipboardData.getData("text/plain");
      if (html) {
        document.execCommand("insertHTML", false, cleanPastedHtml(html));
      } else if (text) {
        document.execCommand("insertText", false, text);
      }
      emit();
    },
    [emit],
  );

  // ── Inline image upload ────────────────────────────────────────────────
  async function uploadAndInsert(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const access = tokenStore.access;
      const res = await fetch(`${API_URL}${uploadPath}`, {
        method: "POST",
        headers: access ? { Authorization: `Bearer ${access}` } : undefined,
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.message ?? `HTTP ${res.status}`);
      }
      const url = resolveUrl(json.data.url as string);
      ref.current?.focus();
      // Insert centered by default via our alignment class.
      document.execCommand(
        "insertHTML",
        false,
        `<img src="${url}" class="rte-img rte-img--center" alt="" />`,
      );
      emit();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload gambar gagal");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Image selection (click an image to reveal its toolbar) ──────────────
  const positionImgToolbar = useCallback((img: HTMLImageElement) => {
    const host = ref.current;
    if (!host) return;
    const hostBox = host.getBoundingClientRect();
    const box = img.getBoundingClientRect();
    setImgSel({
      top: box.top - hostBox.top + host.scrollTop - 8,
      left: box.left - hostBox.left + box.width / 2,
    });
  }, []);

  const onEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG") {
        imgElRef.current = target as HTMLImageElement;
        positionImgToolbar(target as HTMLImageElement);
      } else {
        imgElRef.current = null;
        setImgSel(null);
      }
      syncBlock();
    },
    [positionImgToolbar, syncBlock],
  );

  function alignImage(align: Align) {
    const img = imgElRef.current;
    if (!img) return;
    img.classList.remove("rte-img--left", "rte-img--center", "rte-img--right");
    img.classList.add("rte-img", `rte-img--${align}`);
    emit();
    positionImgToolbar(img);
  }

  function toggleCaption() {
    const img = imgElRef.current;
    if (!img) return;
    const parent = img.parentElement;
    if (parent && parent.tagName === "FIGURE") {
      // Remove caption → unwrap figure.
      parent.replaceWith(img);
    } else {
      const fig = document.createElement("figure");
      fig.className = "rte-fig";
      const cap = document.createElement("figcaption");
      cap.textContent = "Tulis keterangan gambar…";
      img.replaceWith(fig);
      fig.appendChild(img);
      fig.appendChild(cap);
    }
    emit();
    setImgSel(null);
    imgElRef.current = null;
  }

  function deleteImage() {
    const img = imgElRef.current;
    if (!img) return;
    (img.parentElement?.tagName === "FIGURE" ? img.parentElement : img).remove();
    emit();
    setImgSel(null);
    imgElRef.current = null;
  }

  const Btn = ({
    onClick,
    title,
    active,
    children,
  }: {
    onClick: () => void;
    title: string;
    active?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`grid h-8 w-8 place-items-center rounded-md transition ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
      }`}
    >
      {children}
    </button>
  );

  const Sep = () => <span className="mx-1 h-5 w-px bg-slate-200" />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5 sticky top-0 z-10">
        <select
          value={["p", "h2", "h3", "blockquote"].includes(block) ? block : "p"}
          onChange={(e) => applyBlock(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          title="Format paragraf"
          className="mr-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-emerald-400"
        >
          <option value="p">Paragraf</option>
          <option value="h2">Judul (H2)</option>
          <option value="h3">Sub-judul (H3)</option>
          <option value="blockquote">Kutipan</option>
        </select>
        <Sep />
        <Btn title="Tebal (Ctrl+B)" onClick={() => exec("bold")}>
          <Bold size={16} />
        </Btn>
        <Btn title="Miring (Ctrl+I)" onClick={() => exec("italic")}>
          <Italic size={16} />
        </Btn>
        <Btn title="Garis bawah (Ctrl+U)" onClick={() => exec("underline")}>
          <Underline size={16} />
        </Btn>
        <Btn title="Coret" onClick={() => exec("strikeThrough")}>
          <Strikethrough size={16} />
        </Btn>
        <Sep />
        <Btn title="Daftar berpoin" onClick={() => exec("insertUnorderedList")}>
          <List size={16} />
        </Btn>
        <Btn title="Daftar bernomor" onClick={() => exec("insertOrderedList")}>
          <ListOrdered size={16} />
        </Btn>
        <Btn title="Kutipan" onClick={() => applyBlock("blockquote")}>
          <Quote size={16} />
        </Btn>
        <Sep />
        <Btn title="Sisipkan tautan" onClick={addLink}>
          <Link2 size={16} />
        </Btn>
        <Btn
          title={uploading ? "Mengupload…" : "Sisipkan gambar"}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus size={16} className={uploading ? "animate-pulse" : ""} />
        </Btn>
        <Sep />
        <Btn title="Hapus format" onClick={() => exec("removeFormat")}>
          <RemoveFormatting size={16} />
        </Btn>
        <Btn title="Urungkan" onClick={() => exec("undo")}>
          <Undo2 size={16} />
        </Btn>
        <Btn title="Ulangi" onClick={() => exec("redo")}>
          <Redo2 size={16} />
        </Btn>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadAndInsert(f);
          }}
        />
      </div>

      {/* Editable surface (relative so the image toolbar can anchor to it) */}
      <div className="relative">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onPaste={onPaste}
          onClick={onEditorClick}
          onKeyUp={syncBlock}
          onBlur={() => {
            setFocused(false);
            emit();
          }}
          onFocus={() => setFocused(true)}
          data-placeholder={placeholder}
          className="rte-surface prose-article min-h-[360px] max-h-[70vh] overflow-y-auto px-4 py-4 text-[15px] leading-relaxed text-slate-800 outline-none"
        />

        {imgSel && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-full flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-1 shadow-lg"
            style={{ top: imgSel.top, left: imgSel.left }}
          >
            <Btn title="Rata kiri" onClick={() => alignImage("left")}>
              <AlignLeft size={15} />
            </Btn>
            <Btn title="Rata tengah" onClick={() => alignImage("center")}>
              <AlignCenter size={15} />
            </Btn>
            <Btn title="Rata kanan" onClick={() => alignImage("right")}>
              <AlignRight size={15} />
            </Btn>
            <Sep />
            <Btn title="Keterangan gambar" onClick={toggleCaption}>
              <Captions size={15} />
            </Btn>
            <Btn title="Hapus gambar" onClick={deleteImage}>
              <Trash2 size={15} />
            </Btn>
          </div>
        )}
      </div>

      <style jsx global>{`
        .rte-surface:empty::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
        .prose-article h2 {
          font-size: 1.4rem;
          font-weight: 700;
          margin: 1.1rem 0 0.5rem;
          color: #0f172a;
        }
        .prose-article h3 {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 1rem 0 0.4rem;
          color: #0f172a;
        }
        .prose-article p {
          margin: 0.6rem 0;
        }
        .prose-article ul,
        .prose-article ol {
          margin: 0.6rem 0;
          padding-left: 1.5rem;
        }
        .prose-article ul {
          list-style: disc;
        }
        .prose-article ol {
          list-style: decimal;
        }
        .prose-article blockquote {
          border-left: 4px solid #10b981;
          background: #f0fdf4;
          margin: 0.9rem 0;
          padding: 0.5rem 1rem;
          color: #334155;
          font-style: italic;
          border-radius: 0 0.5rem 0.5rem 0;
        }
        .prose-article a {
          color: #047857;
          text-decoration: underline;
        }
        .prose-article img {
          max-width: 100%;
          height: auto;
          border-radius: 0.75rem;
          margin: 0.8rem 0;
          cursor: pointer;
        }
        .prose-article img.rte-img--center {
          display: block;
          margin-left: auto;
          margin-right: auto;
        }
        .prose-article img.rte-img--left {
          float: left;
          max-width: 50%;
          margin: 0.3rem 1rem 0.6rem 0;
        }
        .prose-article img.rte-img--right {
          float: right;
          max-width: 50%;
          margin: 0.3rem 0 0.6rem 1rem;
        }
        .prose-article figure.rte-fig {
          margin: 0.9rem 0;
        }
        .prose-article figure.rte-fig figcaption {
          text-align: center;
          font-size: 0.8rem;
          color: #64748b;
          margin-top: 0.3rem;
        }
      `}</style>
    </div>
  );
}

/** Prepend the API origin to a relative /uploads path. */
function resolveUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) {
    const origin = API_URL.replace(/\/api\/v\d+\/?$/, "");
    return `${origin}${url}`;
  }
  return url;
}

/**
 * Strip the noise pasted from Word / Google Docs / web pages: comments, mso
 * conditionals, <style>/<script>, all inline `style`/`class`/lang attributes,
 * and disallowed tags — keeping only clean structural markup.
 */
function cleanPastedHtml(raw: string): string {
  let html = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, "")
    .replace(/<\/?(?:o:p|xml|w:[a-z]+)[^>]*>/gi, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");

  const allowed = new Set([
    "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li", "blockquote", "a", "img", "figure", "figcaption",
  ]);

  if (typeof window !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const walk = (node: Element) => {
      [...node.children].forEach((child) => {
        walk(child);
        const tag = child.tagName.toLowerCase();
        if (!allowed.has(tag)) {
          // Unwrap: replace the element with its children (keep text).
          child.replaceWith(...Array.from(child.childNodes));
          return;
        }
        // Drop every attribute except href (links) and src/alt (images).
        for (const attr of [...child.attributes]) {
          const keep =
            (tag === "a" && attr.name === "href") ||
            (tag === "img" && (attr.name === "src" || attr.name === "alt"));
          if (!keep) child.removeAttribute(attr.name);
        }
      });
    };
    walk(doc.body);
    html = doc.body.innerHTML;
  }
  return html;
}
