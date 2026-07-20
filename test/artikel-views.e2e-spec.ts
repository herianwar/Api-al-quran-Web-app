import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArtikelService } from '../src/modules/artikel/artikel.service';

/**
 * Regression guard for the article view counter:
 *  - reading an article increments `views`…
 *  - …but must NOT move `updatedAt` (it is the `?since=` delta-sync cursor
 *    and part of the ETag'd list payload — bumping it on every read made
 *    every article look "changed" and made the cache unhittable).
 *  - increments are buffered, so nothing is written before a flush.
 *  - the detail payload reports the stored views, not a live per-request +1.
 */
describe('Artikel view counter (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let artikel: ArtikelService;

  const pid = process.pid;
  const slug = `art-views-${pid}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    artikel = app.get(ArtikelService);

    await prisma.artikel.deleteMany({ where: { slug } }).catch(() => undefined);
    await artikel.create({
      slug,
      judul: `Artikel views ${pid}`,
      konten: '<p>Isi artikel untuk uji penghitung view.</p>',
      status: 'published',
    });
  });

  afterAll(async () => {
    await prisma.artikel.deleteMany({ where: { slug } }).catch(() => undefined);
    await app.close();
  });

  const row = () =>
    prisma.artikel.findUniqueOrThrow({
      where: { slug },
      select: { id: true, views: true, updatedAt: true },
    });

  it('increments views without touching updatedAt', async () => {
    const before = await row();

    // Distinct IPs: shouldCountView dedupes ip+slug for 30 minutes.
    await artikel.getBySlug(slug, '10.0.0.1');
    await artikel.getBySlug(slug, '10.0.0.2');
    await artikel.getBySlug(slug, '10.0.0.3');

    // Buffered: still nothing written at this point.
    const buffered = await row();
    expect(buffered.views).toBe(before.views);

    await artikel.flushViews();

    const after = await row();
    expect(after.views).toBe(before.views + 3);
    // The whole point of the raw UPDATE.
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('does not double-count the same IP within the dedupe window', async () => {
    const before = await row();
    await artikel.getBySlug(slug, '10.0.0.9');
    await artikel.getBySlug(slug, '10.0.0.9');
    await artikel.flushViews();
    const after = await row();
    expect(after.views).toBe(before.views + 1);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('detail payload reports the stored view count (stable per read)', async () => {
    await artikel.flushViews();
    const stored = await row();
    const res = await artikel.getBySlug(slug, '10.0.1.1');
    expect((res.data as { views: number }).views).toBe(stored.views);
  });

  it('leaves updatedAt alone across many buffered reads', async () => {
    // Drain whatever the previous test queued so the delta below is exact.
    await artikel.flushViews();
    const before = await row();
    for (let i = 0; i < 25; i++) {
      await artikel.getBySlug(slug, `10.1.0.${i}`);
    }
    await artikel.flushViews();
    const after = await row();
    expect(after.views).toBe(before.views + 25);
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });
});
