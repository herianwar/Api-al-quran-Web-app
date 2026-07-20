import { promises as fsp } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import sharp from 'sharp';
import {
  generateWidthVariants,
  processImageToWebp,
  variantFilename,
} from '../src/common/util/image';

/**
 * Verifies the upload image optimizer:
 *  - a large PNG/JPEG is converted to a resized WebP (smaller, capped width)
 *  - the original file is removed, the new .webp is returned
 *  - an animated GIF passes through untouched
 * Pure filesystem test — no Nest/DB needed.
 */
describe('processImageToWebp (e2e)', () => {
  let dir = '';

  beforeAll(async () => {
    dir = join(tmpdir(), `img-webp-test-${process.pid}`);
    await fsp.mkdir(dir, { recursive: true });
  });

  afterAll(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('converts a large PNG to a resized WebP and drops the original', async () => {
    // 3000x2000 noisy image so it does not compress to nothing.
    const name = 'big.png';
    const raw = Buffer.alloc(3000 * 2000 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) & 0xff;
    await sharp(raw, { raw: { width: 3000, height: 2000, channels: 3 } })
      .png()
      .toFile(join(dir, name));
    // Full-resolution WebP of the same source, for an apples-to-apples
    // size comparison that doesn't depend on the source codec (PNG can
    // over-compress a synthetic pattern, making raw before/after noisy).
    const fullResWebp = (
      await sharp(join(dir, name)).webp({ quality: 80 }).toBuffer()
    ).length;

    const res = await processImageToWebp(dir, name, { maxWidth: 1200 });

    expect(res.converted).toBe(true);
    expect(res.filename).toBe('big.webp');
    // original removed, webp present
    await expect(fsp.stat(join(dir, name))).rejects.toBeDefined();
    const outMeta = await sharp(join(dir, res.filename)).metadata();
    expect(outMeta.format).toBe('webp');
    expect(outMeta.width).toBe(1200); // downscaled to maxWidth
    // Resizing 3000→1200px must cut bytes vs the full-res WebP.
    expect(res.size).toBeLessThan(fullResWebp);
  });

  it('does not upscale an image smaller than maxWidth', async () => {
    const name = 'small.jpg';
    await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#123456' },
    })
      .jpeg()
      .toFile(join(dir, name));

    const res = await processImageToWebp(dir, name, { maxWidth: 1600 });
    expect(res.converted).toBe(true);
    const outMeta = await sharp(join(dir, res.filename)).metadata();
    expect(outMeta.width).toBe(400); // unchanged, no enlargement
  });

  it('leaves an animated GIF untouched (pass-through)', async () => {
    const name = 'anim.gif';
    // minimal gif bytes; content irrelevant — we only assert pass-through
    await fsp.writeFile(join(dir, name), Buffer.from('GIF89a-fake-animated'));

    const res = await processImageToWebp(dir, name, { maxWidth: 800 });
    expect(res.converted).toBe(false);
    expect(res.filename).toBe('anim.gif');
    await expect(fsp.stat(join(dir, name))).resolves.toBeDefined();
  });

  describe('generateWidthVariants', () => {
    it('writes down-scaled webp siblings named <base>-<width>w.webp', async () => {
      const name = 'cover.webp';
      await sharp({
        create: { width: 2000, height: 1200, channels: 3, background: '#abcdef' },
      })
        .webp()
        .toFile(join(dir, name));

      const written = await generateWidthVariants(dir, name, [400, 800]);
      expect(written).toEqual(['cover-400w.webp', 'cover-800w.webp']);

      const thumb = await sharp(join(dir, variantFilename(name, 400))).metadata();
      expect(thumb.format).toBe('webp');
      expect(thumb.width).toBe(400);
      const hero = await sharp(join(dir, variantFilename(name, 800))).metadata();
      expect(hero.width).toBe(800);

      // The source is left in place.
      await expect(fsp.stat(join(dir, name))).resolves.toBeDefined();
    });

    it('never upscales past the source width', async () => {
      const name = 'small-cover.webp';
      await sharp({
        create: { width: 500, height: 300, channels: 3, background: '#112233' },
      })
        .webp()
        .toFile(join(dir, name));

      await generateWidthVariants(dir, name, [400, 800]);
      const w400 = await sharp(join(dir, variantFilename(name, 400))).metadata();
      expect(w400.width).toBe(400);
      // 800 requested but source is only 500 wide → stays 500 (no enlargement).
      const w800 = await sharp(join(dir, variantFilename(name, 800))).metadata();
      expect(w800.width).toBe(500);
    });

    it('skips gifs (no variants)', async () => {
      const name = 'anim2.gif';
      await fsp.writeFile(join(dir, name), Buffer.from('GIF89a-fake'));
      const written = await generateWidthVariants(dir, name, [400, 800]);
      expect(written).toEqual([]);
    });
  });
});
