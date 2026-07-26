import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArtikelService } from '../src/modules/artikel/artikel.service';

/**
 * Covers the admin article-list features added for the panel UI:
 *  - `?sort=` (populer / disukai / judul / terbit) reorders the list
 *  - `?uncategorized=true` filters articles without a category (admin only)
 *  - bulk action "category" moves + detaches a category
 *  - adminStats() reports per-status counts, totals and the next scheduled post
 * Service-level style like the other artikel specs (no HTTP/guards).
 */
describe('Artikel admin list & stats (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let artikel: ArtikelService;

  const pid = process.pid;
  const slugs: string[] = [];
  const ids: number[] = [];
  let categoryId = 0;
  const kategoriSlug = `kat-adm-${pid}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    artikel = app.get(ArtikelService);
  });

  afterAll(async () => {
    await prisma.artikel
      .deleteMany({ where: { slug: { in: slugs } } })
      .catch(() => undefined);
    await prisma.artikelKategori
      .deleteMany({ where: { slug: kategoriSlug } })
      .catch(() => undefined);
    await app.close();
  });

  const data = <T>(res: { data: unknown }) => res.data as T;

  async function make(
    suffix: string,
    over: Partial<{
      judul: string;
      status: string;
      categoryId: number;
      scheduledAt: string;
    }> = {},
  ) {
    const slug = `art-adm-${pid}-${suffix}`;
    slugs.push(slug);
    const row = data<{ id: number }>(
      await artikel.create({
        slug,
        judul: over.judul ?? `Artikel ${suffix}`,
        konten: `<p>Isi artikel ${suffix} yang cukup panjang untuk lolos.</p>`,
        status: over.status,
        categoryId: over.categoryId,
        scheduledAt: over.scheduledAt,
      }),
    );
    ids.push(row.id);
    return row.id;
  }

  /** Only our own fixtures — the test DB may hold rows from other specs. */
  function mine(rows: { id: number }[]) {
    return rows.filter((r) => ids.includes(r.id));
  }

  it('seeds fixtures (kategori + 3 artikel)', async () => {
    const kat = data<{ id: number }>(
      await artikel.createKategori({ slug: kategoriSlug, nama: `Kat ${pid}` }),
    );
    categoryId = kat.id;

    const zebra = await make('zebra', {
      judul: `Zebra ${pid}`,
      status: 'published',
      categoryId,
    });
    const alpha = await make('alpha', {
      judul: `Alpha ${pid}`,
      status: 'published',
    });
    await make('draft');

    // Give "zebra" traction so the popularity sorts have something to order on.
    await prisma.artikel.update({
      where: { id: zebra },
      data: { views: 999_000, likeCount: 4242 },
    });
    await prisma.artikel.update({
      where: { id: alpha },
      data: { views: 1, likeCount: 0 },
    });
    expect(categoryId).toBeGreaterThan(0);
  });

  it('sort=populer puts the most-viewed article first', async () => {
    const res = await artikel.list(
      { page: 1, limit: 200, sort: 'populer' },
      false,
    );
    const rows = mine(data<{ id: number; judul: string; views: number }[]>(res));
    expect(rows[0].judul).toBe(`Zebra ${pid}`);
  });

  it('sort=disukai puts the most-liked article first', async () => {
    const res = await artikel.list(
      { page: 1, limit: 200, sort: 'disukai' },
      false,
    );
    const rows = mine(data<{ id: number; judul: string }[]>(res));
    expect(rows[0].judul).toBe(`Zebra ${pid}`);
  });

  it('sort=judul orders alphabetically', async () => {
    const res = await artikel.list({ page: 1, limit: 500, sort: 'judul' }, false);
    const rows = mine(data<{ judul: string }[]>(res));
    const judul = rows.map((r) => r.judul);
    expect(judul.indexOf(`Alpha ${pid}`)).toBeLessThan(
      judul.indexOf(`Zebra ${pid}`),
    );
  });

  it('sort=terbit keeps drafts (no publishedAt) after published rows', async () => {
    const res = await artikel.list({ page: 1, limit: 500, sort: 'terbit' }, false);
    const rows = mine(
      data<{ judul: string; publishedAt: string | null }[]>(res),
    );
    const firstNull = rows.findIndex((r) => !r.publishedAt);
    const lastDated = rows.map((r) => !!r.publishedAt).lastIndexOf(true);
    expect(firstNull).toBeGreaterThan(lastDated - 1);
  });

  it('uncategorized=true returns only articles without a category', async () => {
    const res = await artikel.list(
      { page: 1, limit: 500, uncategorized: true },
      false,
    );
    const rows = mine(
      data<{ judul: string; category: unknown | null }[]>(res),
    );
    expect(rows.length).toBe(2); // alpha + draft
    expect(rows.every((r) => r.category === null)).toBe(true);
  });

  it('bulk "category" moves the selected articles into a category', async () => {
    const res = await artikel.bulkAction({
      ids,
      action: 'category',
      categoryId,
    });
    expect(data<{ affected: number }>(res).affected).toBe(ids.length);
    const rows = await prisma.artikel.findMany({
      where: { id: { in: ids } },
      select: { categoryId: true },
    });
    expect(rows.every((r) => r.categoryId === categoryId)).toBe(true);
  });

  it('bulk "category" without categoryId detaches the category', async () => {
    await artikel.bulkAction({ ids, action: 'category' });
    const rows = await prisma.artikel.findMany({
      where: { id: { in: ids } },
      select: { categoryId: true },
    });
    expect(rows.every((r) => r.categoryId === null)).toBe(true);
  });

  it('bulk "category" with an unknown category id is rejected', async () => {
    await expect(
      artikel.bulkAction({ ids, action: 'category', categoryId: 99_999_999 }),
    ).rejects.toThrow();
  });

  it('adminStats reports counts, totals and the next scheduled article', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await make('jadwal', { status: 'scheduled', scheduledAt: future });

    const s = data<{
      total: number;
      published: number;
      draft: number;
      scheduled: number;
      totalViews: number;
      totalLikes: number;
      uncategorized: number;
      nextScheduled: { scheduledAt: string } | null;
      topViewed: { views: number }[];
      byCategory: { id: number; jumlahArtikel: number }[];
    }>(await artikel.adminStats());

    expect(s.total).toBeGreaterThanOrEqual(4);
    expect(s.published).toBeGreaterThanOrEqual(2);
    expect(s.scheduled).toBeGreaterThanOrEqual(1);
    expect(s.totalViews).toBeGreaterThanOrEqual(999_000);
    expect(s.totalLikes).toBeGreaterThanOrEqual(4242);
    expect(s.uncategorized).toBeGreaterThanOrEqual(4);
    expect(s.nextScheduled).not.toBeNull();
    // Our fixture category exists in the breakdown (0 articles after detach).
    expect(s.byCategory.some((c) => c.id === categoryId)).toBe(true);
    // topViewed is sorted desc.
    for (let i = 1; i < s.topViewed.length; i++) {
      expect(s.topViewed[i - 1].views).toBeGreaterThanOrEqual(
        s.topViewed[i].views,
      );
    }
  });
});
