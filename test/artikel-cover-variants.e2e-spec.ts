import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArtikelService } from '../src/modules/artikel/artikel.service';

/**
 * The public article payload gains derived cover fields:
 *   coverThumbUrl (400w) and coverHeroUrl (800w), both siblings of coverUrl.
 * They must appear for our own /uploads/artikel/*.webp covers and be null for
 * external / non-webp covers (so the app can fall back to coverUrl). coverUrl
 * itself is never altered — old app builds keep working.
 */
describe('Artikel cover variants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let artikel: ArtikelService;

  const pid = process.pid;
  const slugs = [`art-cover-webp-${pid}`, `art-cover-ext-${pid}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    artikel = app.get(ArtikelService);
    await prisma.artikel
      .deleteMany({ where: { slug: { in: slugs } } })
      .catch(() => undefined);
  });

  afterAll(async () => {
    await prisma.artikel
      .deleteMany({ where: { slug: { in: slugs } } })
      .catch(() => undefined);
    await app.close();
  });

  const data = <T>(r: { data: unknown }) => r.data as T;

  it('derives thumb + hero URLs for a local webp cover', async () => {
    await artikel.create({
      slug: slugs[0],
      judul: `Cover webp ${pid}`,
      konten: '<p>isi</p>',
      status: 'published',
      coverUrl: '/uploads/artikel/1234-abcd.webp',
    });
    const res = await artikel.getBySlug(slugs[0], '10.5.0.1');
    const d = data<{
      coverUrl: string;
      coverThumbUrl: string;
      coverHeroUrl: string;
    }>(res);
    // coverUrl preserved (absolutized), variants derived from its filename.
    expect(d.coverUrl).toMatch(/\/uploads\/artikel\/1234-abcd\.webp$/);
    expect(d.coverThumbUrl).toMatch(/\/uploads\/artikel\/1234-abcd-400w\.webp$/);
    expect(d.coverHeroUrl).toMatch(/\/uploads\/artikel\/1234-abcd-800w\.webp$/);

    // Same fields present in the list payload.
    const list = await artikel.list({ page: 1, limit: 50 } as never, true);
    const item = (list.data as Array<{ slug: string; coverThumbUrl: string | null }>).find(
      (r) => r.slug === slugs[0],
    );
    expect(item?.coverThumbUrl).toMatch(/-400w\.webp$/);
  });

  it('returns null variants for an external cover URL', async () => {
    await artikel.create({
      slug: slugs[1],
      judul: `Cover ext ${pid}`,
      konten: '<p>isi</p>',
      status: 'published',
      coverUrl: 'https://cdn.example.com/foo.jpg',
    });
    const res = await artikel.getBySlug(slugs[1], '10.5.0.2');
    const d = data<{
      coverUrl: string;
      coverThumbUrl: string | null;
      coverHeroUrl: string | null;
    }>(res);
    expect(d.coverUrl).toBe('https://cdn.example.com/foo.jpg'); // untouched
    expect(d.coverThumbUrl).toBeNull();
    expect(d.coverHeroUrl).toBeNull();
  });
});
