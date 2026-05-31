/**
 * Conservative server-side HTML sanitizer for article bodies.
 *
 * Articles are authored only by admins via the WYSIWYG editor, so this is
 * defense-in-depth rather than a hostile-input filter. We avoid pulling in a
 * heavyweight dependency: instead we strip the few constructs that can execute
 * script or exfiltrate data, while keeping the rich formatting tags the editor
 * emits (headings, lists, links, images, blockquote, formatting, etc.).
 *
 *  • Drops <script>, <style>, <iframe>, <object>, <embed>, <link>, <meta>,
 *    <form>, <input>, <noscript> (tag + contents where it matters).
 *  • Strips inline event handlers (on*) and javascript:/data:(non-image) URLs.
 *  • Leaves the remaining markup untouched.
 */

/** Tags whose entire element (open→close, incl. content) must be removed. */
const FORBIDDEN_BLOCK = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'form',
  'template',
];

/** Self-closing / void tags that must be removed on sight. */
const FORBIDDEN_VOID = ['link', 'meta', 'input', 'base'];

export function sanitizeArticleHtml(input: string): string {
  if (!input) return '';
  let html = input;

  // Remove forbidden block elements together with their contents.
  for (const tag of FORBIDDEN_BLOCK) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi');
    html = html.replace(re, '');
    // Also drop a dangling open tag with no matching close.
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '');
  }

  // Remove forbidden void elements.
  for (const tag of FORBIDDEN_VOID) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '');
  }

  // Strip inline event handler attributes: on*="..." / on*='...' / on*=value.
  html = html.replace(
    /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    '',
  );

  // Neutralize javascript:/vbscript: URLs in href/src/etc.
  html = html.replace(
    /(\s(?:href|src|xlink:href)\s*=\s*)(["'])\s*(?:javascript|vbscript):[^"']*\2/gi,
    '$1$2#$2',
  );

  // Disallow non-image data: URIs (allow data:image/* used for pasted images).
  html = html.replace(
    /(\s(?:href|src)\s*=\s*)(["'])\s*data:(?!image\/)[^"']*\2/gi,
    '$1$2#$2',
  );

  return html.trim();
}

/** Plain-text preview from HTML (for auto-excerpt + reading-time estimate). */
export function htmlToText(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Estimate reading time in minutes (~200 words/min, floor of 1). */
export function estimateReadingMinutes(html: string): number {
  const words = htmlToText(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Collect the relative `/uploads/artikel/<file>` URLs referenced by <img>
 *  tags in the body — used to clean up orphaned uploads on edit/delete. */
export function extractArtikelUploadUrls(html: string): string[] {
  if (!html) return [];
  const out = new Set<string>();
  const re = /(?:src|href)\s*=\s*["']([^"']*\/uploads\/artikel\/[^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    // Normalize an absolute URL (https://host/uploads/...) down to the path.
    const idx = m[1].indexOf('/uploads/artikel/');
    if (idx >= 0) out.add(m[1].slice(idx));
  }
  return [...out];
}
