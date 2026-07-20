import { Logger } from '@nestjs/common';
import { promises as fsp } from 'fs';
import { extname, join } from 'path';
import sharp from 'sharp';

const logger = new Logger('ImageProcess');

/** WebP encode quality (0-100). 80 is visually near-lossless for photos while
 *  cutting size ~25-35% vs JPEG and far more vs PNG. */
const WEBP_QUALITY = 80;

export interface ProcessImageResult {
  /** Filename to persist/serve (may differ from input: `.webp` after convert). */
  filename: string;
  /** Byte size of the file now on disk. */
  size: number;
  /** True if the file was converted/re-encoded to WebP. */
  converted: boolean;
}

/**
 * Convert an already-uploaded image (written to `dir/filename` by multer) into
 * a resized, metadata-stripped WebP to keep web + Flutter Android payloads
 * light. Deletes the original and returns the new `.webp` filename.
 *
 * - Auto-orients via EXIF (`rotate()`), then strips metadata (privacy + size).
 * - Downscales to `maxWidth` (never upscales — `withoutEnlargement`).
 * - Animated GIFs are left untouched (converting/resizing risks losing frames);
 *   they're rare in this content and pass through as-is.
 * - Best-effort: on any sharp failure the original file is kept and returned,
 *   so an upload never fails just because optimization did.
 */
export async function processImageToWebp(
  dir: string,
  filename: string,
  opts: { maxWidth: number },
): Promise<ProcessImageResult> {
  const srcPath = join(dir, filename);
  const ext = extname(filename).toLowerCase();

  // Leave animated GIFs alone — resizing/converting can drop animation.
  if (ext === '.gif') {
    const size = await fileSize(srcPath);
    return { filename, size, converted: false };
  }

  const base = filename.slice(0, filename.length - ext.length);
  const outName = `${base}.webp`;
  const outPath = join(dir, outName);

  try {
    const buffer = await sharp(srcPath)
      .rotate() // apply EXIF orientation before we strip metadata
      .resize({ width: opts.maxWidth, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    await fsp.writeFile(outPath, buffer);
    // Remove the original if the converted file has a different name.
    if (outName !== filename) {
      await fsp.unlink(srcPath).catch(() => undefined);
    }
    return { filename: outName, size: buffer.length, converted: true };
  } catch (err) {
    logger.warn(
      `WebP conversion failed for ${filename}, keeping original: ${(err as Error).message}`,
    );
    // Clean up any partial output, keep the original untouched.
    await fsp.unlink(outPath).catch(() => undefined);
    const size = await fileSize(srcPath);
    return { filename, size, converted: false };
  }
}

/** Suffix used for width variants: `foo.webp` → `foo-400w.webp`. */
export function variantFilename(filename: string, width: number): string {
  const ext = extname(filename);
  return `${filename.slice(0, filename.length - ext.length)}-${width}w.webp`;
}

/**
 * Write down-scaled WebP siblings of an already-processed upload, so list
 * cards can fetch a 400px-wide file instead of the full-size original.
 *
 * Named `<base>-<width>w.webp` next to the source. Never upscales: asking for
 * 800w from a 500px-wide source just re-encodes at 500px, which is still a
 * smaller file than the original and keeps the URL predictable.
 *
 * Best-effort per width — a failure is logged and skipped rather than failing
 * the upload, exactly like {@link processImageToWebp}.
 *
 * @returns the filenames actually written.
 */
export async function generateWidthVariants(
  dir: string,
  filename: string,
  widths: number[],
): Promise<string[]> {
  // Animated GIFs are passed through untouched upstream; resizing them here
  // would flatten the animation.
  if (extname(filename).toLowerCase() === '.gif') return [];

  const written: string[] = [];
  for (const width of widths) {
    const outName = variantFilename(filename, width);
    if (outName === filename) continue; // never overwrite the source
    try {
      const buffer = await sharp(join(dir, filename))
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      await fsp.writeFile(join(dir, outName), buffer);
      written.push(outName);
    } catch (err) {
      logger.warn(
        `Variant ${width}w failed for ${filename}: ${(err as Error).message}`,
      );
    }
  }
  return written;
}

async function fileSize(path: string): Promise<number> {
  try {
    const stat = await fsp.stat(path);
    return stat.size;
  } catch {
    return 0;
  }
}
