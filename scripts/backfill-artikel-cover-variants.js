/**
 * One-off backfill: generate 400w/800w WebP cover variants for articles whose
 * cover was uploaded before variant generation existed.
 *
 * For each published/draft article whose coverUrl points at a local
 * /uploads/artikel/*.webp file, writes `<base>-400w.webp` and `<base>-800w.webp`
 * next to it (unless already present). Skips external URLs, non-webp covers,
 * and missing source files. Idempotent — re-running only fills gaps.
 *
 * Mirrors the runtime logic in ArtikelService.coverVariantUrl /
 * generateWidthVariants so the derived API URLs (coverThumbUrl / coverHeroUrl)
 * resolve to real files.
 *
 * Run: set -a; source .env; set +a; node scripts/backfill-artikel-cover-variants.js
 *   Optional: DRY_RUN=1 to only report what would be written.
 */
const { PrismaClient } = require('@prisma/client');
const { promises: fsp } = require('fs');
const path = require('path');
const sharp = require('sharp');

const prisma = new PrismaClient();

const WIDTHS = [400, 800];
const WEBP_QUALITY = 80;
const DRY_RUN = process.env.DRY_RUN === '1';

// data/uploads/artikel relative to repo root (this script lives in scripts/).
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads', 'artikel');
const PREFIX = '/uploads/artikel/';

function variantName(filename, width) {
  const ext = path.extname(filename);
  return `${filename.slice(0, filename.length - ext.length)}-${width}w.webp`;
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const rows = await prisma.artikel.findMany({
    where: { coverUrl: { startsWith: PREFIX } },
    select: { id: true, slug: true, coverUrl: true },
  });

  let scanned = 0;
  let written = 0;
  let skipped = 0;

  for (const row of rows) {
    scanned++;
    const cover = row.coverUrl;
    if (!cover.toLowerCase().endsWith('.webp')) {
      skipped++;
      continue; // gif / legacy jpg — no variant scheme
    }
    const filename = cover.slice(PREFIX.length);
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      skipped++;
      continue;
    }
    const srcPath = path.join(UPLOAD_DIR, filename);
    if (!(await exists(srcPath))) {
      console.warn(`  ! source missing for #${row.id} (${row.slug}): ${filename}`);
      skipped++;
      continue;
    }

    for (const width of WIDTHS) {
      const outName = variantName(filename, width);
      const outPath = path.join(UPLOAD_DIR, outName);
      if (await exists(outPath)) continue; // already backfilled
      if (DRY_RUN) {
        console.log(`  [dry] would write ${outName}`);
        written++;
        continue;
      }
      try {
        const buf = await sharp(srcPath)
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        await fsp.writeFile(outPath, buf);
        console.log(`  + ${outName} (${buf.length} bytes)`);
        written++;
      } catch (err) {
        console.warn(`  ! ${width}w failed for ${filename}: ${err.message}`);
      }
    }
  }

  console.log(
    `\nDone. articles scanned=${scanned}, variants written=${written}, skipped=${skipped}${DRY_RUN ? ' (dry-run)' : ''}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
