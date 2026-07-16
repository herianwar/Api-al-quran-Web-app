import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArtikelService } from '../src/modules/artikel/artikel.service';
import { SerambiService } from '../src/modules/serambi/serambi.service';

/**
 * Verifies articles reuse the shared Serambi author master:
 *  - creating an article with authorId snapshots the author name into `penulis`
 *  - a bogus authorId is rejected (400)
 *  - updating with authorId='' detaches but keeps the snapshot name
 *  - deleting the author keeps the article (authorId → null)
 * Service-level style like the other specs (no HTTP/guards).
 */
describe('Artikel shared author (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let artikel: ArtikelService;
  let serambi: SerambiService;

  const pid = process.pid;
  const slugs: string[] = [];
  const authorIds: string[] = [];
  const authorName = `Penulis Artikel ${pid}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    artikel = app.get(ArtikelService);
    serambi = app.get(SerambiService);
  });

  afterAll(async () => {
    await prisma.artikel
      .deleteMany({ where: { slug: { in: slugs } } })
      .catch(() => undefined);
    await prisma.serambiAuthor
      .deleteMany({ where: { id: { in: authorIds } } })
      .catch(() => undefined);
    await app.close();
  });

  const data = <T>(res: { data: unknown }) => res.data as T;

  async function makeAuthor(name: string) {
    const a = data<{ id: string }>(await serambi.adminCreateAuthor({ name }));
    authorIds.push(a.id);
    return a.id;
  }

  it('creating an article with authorId snapshots name into penulis', async () => {
    const authorId = await makeAuthor(authorName);
    const slug = `art-auth-${pid}`;
    slugs.push(slug);
    const res = await artikel.create({
      slug,
      judul: 'Artikel pakai master penulis',
      konten: '<p>Isi artikel yang cukup panjang untuk lolos.</p>',
      authorId,
      penulis: 'Nama Manual Diabaikan',
    });
    const row = data<{ id: number; penulis: string; authorId: string }>(res);
    expect(row.penulis).toBe(authorName);
    expect(row.authorId).toBe(authorId);
  });

  it('rejects a bogus authorId (400)', async () => {
    await expect(
      artikel.create({
        slug: `art-bogus-${pid}`,
        judul: 'x',
        konten: '<p>xxxxxxxxxx</p>',
        authorId: 'nope',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("update with authorId='' detaches but keeps the snapshot penulis", async () => {
    const row = await prisma.artikel.findFirst({
      where: { slug: `art-auth-${pid}` },
    });
    const res = await artikel.update(row!.id, { authorId: '' });
    const updated = data<{ authorId: string | null; penulis: string }>(res);
    expect(updated.authorId).toBeNull();
    expect(updated.penulis).toBe(authorName); // snapshot preserved
  });

  it('deleting the author keeps the article (authorId → null)', async () => {
    const authorId = await makeAuthor(`Del Artikel ${pid}`);
    const slug = `art-del-${pid}`;
    slugs.push(slug);
    const created = data<{ id: number }>(
      await artikel.create({
        slug,
        judul: 'del',
        konten: '<p>konten cukup panjang</p>',
        authorId,
      }),
    );
    await serambi.adminRemoveAuthor(authorId);
    const row = await prisma.artikel.findUnique({ where: { id: created.id } });
    expect(row).not.toBeNull();
    expect(row?.authorId).toBeNull();
  });
});
