"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Editor, useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { API_URL, tokenStore } from "@/lib/api";

interface Props {
  value: string;
  onChange: (html: string) => void;
  /** Endpoint used for image uploads; returns { url }. */
  uploadPath?: string;
  placeholder?: string;
}

type Align = "left" | "center" | "right";

/**
 * Image node extended with an `align` attribute rendered as the same
 * `rte-img rte-img--{align}` classes the public article CSS already styles —
 * so what you see in the editor matches the rendered article. The stored
 * `src` stays a RELATIVE `/uploads/...` path; the backend absolutizes it for
 * the mobile API, and the browser resolves it against the same origin.
 */
const AlignedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (el: HTMLElement) => {
          const c = el.getAttribute("class") ?? "";
          if (c.includes("rte-img--left")) return "left";
          if (c.includes("rte-img--right")) return "right";
          return "center";
        },
        renderHTML: (attrs: { align?: string }) => ({
          class: `rte-img rte-img--${attrs.align || "center"}`,
        }),
      },
    };
  },
});

/**
 * Modern WYSIWYG editor built on Tiptap/ProseMirror (replaces the old
 * execCommand surface). Emits clean HTML the backend sanitizes & stores.
 * Supports headings, lists, quotes, code, links (rel/target hardened),
 * images (button + drag + paste upload, with alignment), and tables.
 */
export function TiptapEditor({
  value,
  onChange,
  uploadPath = "/admin/artikel/upload",
  placeholder = "Tulis artikel di sini… gunakan toolbar untuk format, judul, gambar, tautan, dan tabel.",
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  // Bump to re-render the toolbar when selection/marks change.
  const [, setTick] = useState(0);
  // Stable ref to the editor so paste/drop handlers (defined at config time)
  // can reach the live instance.
  const editorRef = useRef<Editor | null>(null);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Upload a file then insert it as an <img>. Stores the RELATIVE url.
  const uploadAndInsert = useCallback(
    async (file: File, editor: Editor | null) => {
      if (!editor) return;
      if (!file.type.startsWith("image/")) return;
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
        editor
          .chain()
          .focus()
          .setImage({ src: json.data.url as string })
          .run();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Upload gambar gagal");
      } finally {
        setUploading(false);
      }
    },
    [uploadPath],
  );

  const editor = useEditor({
    immediatelyRender: false, // required under Next SSR to avoid hydration mismatch
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      AlignedImage,
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose-article min-h-[360px] max-h-[70vh] overflow-y-auto px-4 py-4 text-[15px] leading-relaxed text-slate-800 outline-none",
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        for (const it of items) {
          if (it.type.startsWith("image/")) {
            const file = it.getAsFile();
            if (file) {
              event.preventDefault();
              void uploadAndInsert(file, editorRef.current);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = event.dataTransfer?.files;
        if (files && files.length && files[0].type.startsWith("image/")) {
          event.preventDefault();
          void uploadAndInsert(files[0], editorRef.current);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
  });

  // Keep the ref in sync for the paste/drop handlers (defined at config time).
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Re-render toolbar on every selection/content change.
  useEffect(() => {
    if (!editor) return;
    const update = () => setTick((t) => t + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  // Re-seed when the external value changes (e.g. edit-mode hydration), but
  // only when it differs from the live HTML so we never stomp the caret.
  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    if (incoming !== editor.getHTML()) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL tautan (kosongkan untuk hapus):", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  const setImageAlign = useCallback(
    (align: Align) => {
      editor?.chain().focus().updateAttributes("image", { align }).run();
    },
    [editor],
  );

  if (!editor) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white min-h-[420px] grid place-items-center text-sm text-slate-400">
        Memuat editor…
      </div>
    );
  }

  const words = editor.getText().trim().split(/\s+/).filter(Boolean).length;
  const readMin = Math.max(1, Math.round(words / 200));
  const imageActive = editor.isActive("image");

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5 sticky top-0 z-10">
        <Btn title="Paragraf" active={editor.isActive("paragraph") && !editor.isActive("heading")} onClick={() => editor.chain().focus().setParagraph().run()}>
          <Pilcrow size={16} />
        </Btn>
        <Btn title="Judul (H2)" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={16} />
        </Btn>
        <Btn title="Sub-judul (H3)" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={16} />
        </Btn>
        <Sep />
        <Btn title="Tebal (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={16} />
        </Btn>
        <Btn title="Miring (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={16} />
        </Btn>
        <Btn title="Garis bawah (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={16} />
        </Btn>
        <Btn title="Coret" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={16} />
        </Btn>
        <Btn title="Kode" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code size={16} />
        </Btn>
        <Sep />
        <Btn title="Daftar berpoin" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={16} />
        </Btn>
        <Btn title="Daftar bernomor" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </Btn>
        <Btn title="Kutipan" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={16} />
        </Btn>
        <Sep />
        <Btn title="Rata kiri" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft size={16} />
        </Btn>
        <Btn title="Rata tengah" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter size={16} />
        </Btn>
        <Btn title="Rata kanan" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight size={16} />
        </Btn>
        <Sep />
        <Btn title={editor.isActive("link") ? "Ubah/hapus tautan" : "Sisipkan tautan"} active={editor.isActive("link")} onClick={addLink}>
          <Link2 size={16} />
        </Btn>
        {editor.isActive("link") && (
          <Btn title="Hapus tautan" onClick={() => editor.chain().focus().unsetLink().run()}>
            <Link2Off size={16} />
          </Btn>
        )}
        <Btn title={uploading ? "Mengupload…" : "Sisipkan gambar"} onClick={() => fileRef.current?.click()}>
          <ImagePlus size={16} className={uploading ? "animate-pulse" : ""} />
        </Btn>
        <Btn title="Sisipkan tabel" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon size={16} />
        </Btn>
        <Btn title="Garis pemisah" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={16} />
        </Btn>
        <Sep />
        <Btn title="Hapus format" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting size={16} />
        </Btn>
        <Btn title="Urungkan" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={16} />
        </Btn>
        <Btn title="Ulangi" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={16} />
        </Btn>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadAndInsert(f, editor);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </div>

      {/* Contextual image-alignment bar */}
      {imageActive && (
        <div className="flex items-center gap-1 border-b border-slate-200 bg-emerald-50/60 px-3 py-1.5 text-xs text-emerald-800">
          <span className="font-semibold mr-1">Gambar:</span>
          <button type="button" onClick={() => setImageAlign("left")} className="rounded px-2 py-0.5 hover:bg-emerald-100">Kiri</button>
          <button type="button" onClick={() => setImageAlign("center")} className="rounded px-2 py-0.5 hover:bg-emerald-100">Tengah</button>
          <button type="button" onClick={() => setImageAlign("right")} className="rounded px-2 py-0.5 hover:bg-emerald-100">Kanan</button>
        </div>
      )}

      <EditorContent editor={editor} />

      {/* Footer: live word + reading-time count */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs text-slate-500">
        <span className="tabular-nums">{words} kata · ~{readMin} mnt baca</span>
        <span className="text-slate-400">Tarik / tempel gambar langsung ke editor</span>
      </div>

      <style jsx global>{`
        .prose-article .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }
        .prose-article h2 { font-size: 1.4rem; font-weight: 700; margin: 1.1rem 0 0.5rem; color: #0f172a; }
        .prose-article h3 { font-size: 1.15rem; font-weight: 700; margin: 1rem 0 0.4rem; color: #0f172a; }
        .prose-article p { margin: 0.6rem 0; }
        .prose-article ul, .prose-article ol { margin: 0.6rem 0; padding-left: 1.5rem; }
        .prose-article ul { list-style: disc; }
        .prose-article ol { list-style: decimal; }
        .prose-article blockquote {
          border-left: 4px solid #10b981; background: #f0fdf4; margin: 0.9rem 0;
          padding: 0.5rem 1rem; color: #334155; font-style: italic; border-radius: 0 0.5rem 0.5rem 0;
        }
        .prose-article a { color: #047857; text-decoration: underline; }
        .prose-article code { background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.9em; }
        .prose-article hr { margin: 1.2rem 0; border: 0; border-top: 1px solid #e2e8f0; }
        .prose-article img { max-width: 100%; height: auto; border-radius: 0.75rem; margin: 0.8rem 0; }
        .prose-article img.ProseMirror-selectednode { outline: 2px solid #10b981; }
        .prose-article img.rte-img--center { display: block; margin-left: auto; margin-right: auto; }
        .prose-article img.rte-img--left { float: left; max-width: 50%; margin: 0.3rem 1rem 0.6rem 0; }
        .prose-article img.rte-img--right { float: right; max-width: 50%; margin: 0.3rem 0 0.6rem 1rem; }
        .prose-article table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        .prose-article th, .prose-article td { border: 1px solid #cbd5e1; padding: 0.4rem 0.6rem; text-align: left; }
        .prose-article th { background: #f1f5f9; font-weight: 700; }
        .prose-article .selectedCell { background: #d1fae5; }
      `}</style>
    </div>
  );
}

function Btn({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md transition ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-slate-200" />;
}
