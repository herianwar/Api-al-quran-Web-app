import { promises as fsp } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import sharp from 'sharp';
import { processImageToWebp } from '../src/common/util/image';

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
});
