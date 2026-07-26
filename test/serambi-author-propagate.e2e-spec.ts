import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SerambiService } from '../src/modules/serambi/serambi.service';

/**
 * Covers adminUpdateAuthor() propagating the master author's name/avatar into
 * the denormalized snapshot on linked rows — the behaviour that makes
 * "create the author now, upload the photo later" actually work:
 *  - editing avatarUrl rewrites authorAvatarUrl on every linked post
 *  - editing name rewrites authorName on posts AND `penulis` on artikel
 *  - unlinked posts that merely share the same name are NOT touched
 *  - toggling only `active` touches nothing (it is master state, not snapshot)
 * Service-level style like the other serambi specs (no HTTP/guards).
 */
describe('Serambi author propagation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let serambi: SerambiService;

  const pid = process.pid;
  const postIds: string[] = [];
  const authorIds: string[] = [];
  const artikelSlugs: string[] = [];
  const authorName = `Penulis Prop ${pid}`;
  let authorId = '';
  let linkedPostId = '';
  let strayPostId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    serambi = app.get(SerambiService);
  });

  afterAll(async () => {
    await prisma.serambiPost
      .deleteMany({ where: { id: { in: postIds } } })
      .catch(() => undefined);
    await prisma.artikel
      .deleteMany({ where: { slug: { in: artikelSlugs } } })
      .catch(() => undefined);
    await prisma.serambiAuthor
      .deleteMany({ where: { id: { in: authorIds } } })
      .catch(() => undefined);
    await app.close();
  });

  it('seeds an author, a linked post, a stray post and a linked article', async () => {
    const author = await prisma.serambiAuthor.create({
      data: { name: authorName },
    });
    authorId = author.id;
    authorIds.push(author.id);
    expect(author.avatarUrl).toBeNull();

    const linked = await prisma.serambiPost.create({
      data: {
        body: `linked ${pid}`,
        authorId,
        authorName,
        authorAvatarUrl: null,
      },
    });
    linkedPostId = linked.id;
    postIds.push(linked.id);

    // Same displayed name, but never linked to the master row. Stands in for
    // a seeded post that the backfill has not claimed — must stay untouched.
    const stray = await prisma.serambiPost.create({
      data: { body: `stray ${pid}`, authorName, authorAvatarUrl: null },
    });
    strayPostId = stray.id;
    postIds.push(stray.id);

    const slug = `art-prop-${pid}`;
    await prisma.artikel.create({
      data: {
        slug,
        judul: `Artikel prop ${pid}`,
        konten: 'isi',
        penulis: authorName,
        authorId,
      },
    });
    artikelSlugs.push(slug);
  });

  it('uploading the avatar later fills it in on the linked post', async () => {
    const avatar = `/uploads/serambi/av-${pid}.webp`;
    const res = await serambi.adminUpdateAuthor(authorId, {
      avatarUrl: avatar,
    });
    expect((res.data as { syncedPosts: number }).syncedPosts).toBe(1);

    const linked = await prisma.serambiPost.findUnique({
      where: { id: linkedPostId },
      select: { authorAvatarUrl: true },
    });
    expect(linked?.authorAvatarUrl).toBe(avatar);
  });

  it('leaves the unlinked post with the same name alone', async () => {
    const stray = await prisma.serambiPost.findUnique({
      where: { id: strayPostId },
      select: { authorAvatarUrl: true, authorId: true },
    });
    expect(stray?.authorId).toBeNull();
    expect(stray?.authorAvatarUrl).toBeNull();
  });

  it('renaming the author rewrites the snapshot on posts and articles', async () => {
    const renamed = `${authorName} Baru`;
    const res = await serambi.adminUpdateAuthor(authorId, { name: renamed });
    const payload = res.data as { syncedPosts: number; syncedArtikel: number };
    expect(payload.syncedPosts).toBe(1);
    expect(payload.syncedArtikel).toBe(1);

    const linked = await prisma.serambiPost.findUnique({
      where: { id: linkedPostId },
      select: { authorName: true },
    });
    expect(linked?.authorName).toBe(renamed);

    const art = await prisma.artikel.findUnique({
      where: { slug: artikelSlugs[0] },
      select: { penulis: true },
    });
    expect(art?.penulis).toBe(renamed);

    // The stray post keeps the ORIGINAL name — it was never linked.
    const stray = await prisma.serambiPost.findUnique({
      where: { id: strayPostId },
      select: { authorName: true },
    });
    expect(stray?.authorName).toBe(authorName);
  });

  it('toggling only `active` reports no snapshot writes', async () => {
    const res = await serambi.adminUpdateAuthor(authorId, { active: false });
    const payload = res.data as { syncedPosts: number; syncedArtikel: number };
    expect(payload.syncedPosts).toBe(0);
    expect(payload.syncedArtikel).toBe(0);
  });

  it('clearing the avatar propagates the removal too', async () => {
    await serambi.adminUpdateAuthor(authorId, { avatarUrl: '' });
    const linked = await prisma.serambiPost.findUnique({
      where: { id: linkedPostId },
      select: { authorAvatarUrl: true },
    });
    expect(linked?.authorAvatarUrl).toBeNull();
  });
});
