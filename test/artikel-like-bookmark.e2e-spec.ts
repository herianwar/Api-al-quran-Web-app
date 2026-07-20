import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArtikelService } from '../src/modules/artikel/artikel.service';

/**
 * Like & bookmark artikel tersinkron akun (pola SerambiLike).
 *  - like/unlike idempoten + likeCount transaksional, counter ≥ 0
 *  - bookmark/unbookmark idempoten (tanpa counter)
 *  - list/detail/hub membawa flag liked/saved per user; guest → false
 *  - listBookmarks: hanya published, terbaru dulu, saved=true
 *  - sync merge slug lokal (idempoten, slug basi dilewati)
 * Service-level seperti spec artikel lain (tanpa HTTP/guards).
 */
describe('Artikel like & bookmark (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let artikel: ArtikelService;

  const pid = process.pid;
  const slugA = `art-lb-a-${pid}`;
  const slugB = `art-lb-b-${pid}`;
  const slugs = [slugA, slugB];
  let userId = '';
  let otherId = '';

  const data = <T>(r: { data: unknown }) => r.data as T;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    artikel = app.get(ArtikelService);

    await prisma.artikel.deleteMany({ where: { slug: { in: slugs } } }).catch(() => undefined);
    const u = await prisma.user.create({
      data: { email: `art-lb-${pid}@test.local`, passwordHash: 'x' },
    });
    userId = u.id;
    const o = await prisma.user.create({
      data: { email: `art-lb-other-${pid}@test.local`, passwordHash: 'x' },
    });
    otherId = o.id;

    for (const slug of slugs) {
      await artikel.create({
        slug,
        judul: `LB ${slug}`,
        konten: '<p>isi</p>',
        status: 'published',
      });
    }
  });

  afterAll(async () => {
    await prisma.artikel.deleteMany({ where: { slug: { in: slugs } } }).catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { id: { in: [userId, otherId] } } })
      .catch(() => undefined);
    await app.close();
  });

  it('like is idempotent and bumps likeCount once', async () => {
    const r1 = data<{ liked: boolean; likeCount: number }>(
      await artikel.like(slugA, userId),
    );
    expect(r1).toEqual({ liked: true, likeCount: 1 });
    // second like from same user → no double count
    const r2 = data<{ likeCount: number }>(await artikel.like(slugA, userId));
    expect(r2.likeCount).toBe(1);
    // a different user adds a real like
    const r3 = data<{ likeCount: number }>(await artikel.like(slugA, otherId));
    expect(r3.likeCount).toBe(2);
    // row reflects it
    const row = await prisma.artikel.findUniqueOrThrow({
      where: { slug: slugA },
      select: { likeCount: true },
    });
    expect(row.likeCount).toBe(2);
  });

  it('unlike is idempotent and never goes negative', async () => {
    const r1 = data<{ liked: boolean; likeCount: number }>(
      await artikel.unlike(slugA, userId),
    );
    expect(r1).toEqual({ liked: false, likeCount: 1 });
    // unlike again → no-op, stays 1
    const r2 = data<{ likeCount: number }>(await artikel.unlike(slugA, userId));
    expect(r2.likeCount).toBe(1);
    await artikel.unlike(slugA, otherId);
    const r3 = data<{ likeCount: number }>(await artikel.unlike(slugA, otherId));
    expect(r3.likeCount).toBe(0); // clamped, not negative
  });

  it('bookmark / unbookmark are idempotent (no counter)', async () => {
    expect(data<{ saved: boolean }>(await artikel.bookmark(slugA, userId))).toEqual({ saved: true });
    expect(data<{ saved: boolean }>(await artikel.bookmark(slugA, userId))).toEqual({ saved: true });
    const cnt = await prisma.artikelBookmark.count({ where: { userId, artikel: { slug: slugA } } });
    expect(cnt).toBe(1);
    expect(data<{ saved: boolean }>(await artikel.unbookmark(slugA, userId))).toEqual({ saved: false });
    expect(data<{ saved: boolean }>(await artikel.unbookmark(slugA, userId))).toEqual({ saved: false });
  });

  it('list & detail carry per-user liked/saved; guest sees false', async () => {
    await artikel.like(slugB, userId);
    await artikel.bookmark(slugB, userId);

    // logged-in user
    const detail = data<{ liked: boolean; saved: boolean; likeCount: number }>(
      await artikel.getBySlug(slugB, '10.0.0.1', userId),
    );
    expect(detail.liked).toBe(true);
    expect(detail.saved).toBe(true);
    expect(detail.likeCount).toBe(1);

    // guest
    const guest = data<{ liked: boolean; saved: boolean }>(
      await artikel.getBySlug(slugB, '10.0.0.2', null),
    );
    expect(guest.liked).toBe(false);
    expect(guest.saved).toBe(false);

    // list flags
    const list = await artikel.list({ page: 1, limit: 100 } as never, true, userId);
    const item = (list.data as Array<{ slug: string; liked: boolean; saved: boolean }>).find(
      (r) => r.slug === slugB,
    );
    expect(item?.liked).toBe(true);
    expect(item?.saved).toBe(true);
  });

  it('listBookmarks returns saved published articles, newest first', async () => {
    // ensure a clean set: slugA bookmarked after slugB
    await artikel.bookmark(slugB, userId); // already? idempotent
    await artikel.bookmark(slugA, userId);
    const res = await artikel.listBookmarks({ page: 1, limit: 50 } as never, userId);
    const rows = res.data as Array<{ slug: string; saved: boolean; coverThumbUrl: unknown }>;
    const mine = rows.filter((r) => slugs.includes(r.slug));
    expect(mine.map((r) => r.slug)).toEqual([slugA, slugB]); // newest saved first
    expect(mine.every((r) => r.saved === true)).toBe(true);
    expect(mine[0]).toHaveProperty('coverThumbUrl'); // same shape as list
  });

  it('sync merges local slugs idempotently and skips stale ones', async () => {
    const fresh = await prisma.user.create({
      data: { email: `art-lb-sync-${pid}@test.local`, passwordHash: 'x' },
    });
    try {
      const r1 = data<{ likedMerged: number; savedMerged: number; skipped: number }>(
        await artikel.syncInteractions(
          fresh.id,
          [slugA, slugB, 'slug-basi-xyz'],
          [slugA, 'slug-basi-2'],
        ),
      );
      expect(r1.likedMerged).toBe(2);
      expect(r1.savedMerged).toBe(1);
      expect(r1.skipped).toBe(2); // one stale in each field

      // re-run → nothing new merged (idempotent)
      const r2 = data<{ likedMerged: number; savedMerged: number }>(
        await artikel.syncInteractions(fresh.id, [slugA, slugB], [slugA]),
      );
      expect(r2.likedMerged).toBe(0);
      expect(r2.savedMerged).toBe(0);

      // likeCount was incremented exactly once per new like
      const likes = await prisma.artikelLike.count({ where: { userId: fresh.id } });
      expect(likes).toBe(2);
    } finally {
      await prisma.user.delete({ where: { id: fresh.id } }).catch(() => undefined);
    }
  });
});
