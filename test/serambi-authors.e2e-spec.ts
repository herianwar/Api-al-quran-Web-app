import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SerambiService } from '../src/modules/serambi/serambi.service';

/**
 * Verifies the Serambi author master-data feature:
 *  - CRUD authors (unique name → 409 on duplicate)
 *  - creating a post with authorId snapshots the author's name + avatar
 *  - updating a post with authorId re-snapshots; '' detaches
 *  - deleting an author keeps the post (authorId → null, snapshot intact)
 * Service-level style like the other specs (no HTTP/guards).
 */
describe('Serambi authors (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let serambi: SerambiService;

  const pid = process.pid;
  const createdPostIds: string[] = [];
  const createdAuthorIds: string[] = [];
  const authorName = `Ustadz Test ${pid}`;

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
      .deleteMany({ where: { id: { in: createdPostIds } } })
      .catch(() => undefined);
    await prisma.serambiAuthor
      .deleteMany({ where: { id: { in: createdAuthorIds } } })
      .catch(() => undefined);
    await app.close();
  });

  const data = <T>(res: { data: unknown }) => res.data as T;

  it('creates an author and rejects a duplicate name (409)', async () => {
    const res = await serambi.adminCreateAuthor({
      name: authorName,
      avatarUrl: '/uploads/serambi/av.webp',
    });
    const author = data<{ id: string; name: string; avatarUrl: string }>(res);
    createdAuthorIds.push(author.id);
    expect(author.name).toBe(authorName);

    await expect(
      serambi.adminCreateAuthor({ name: authorName }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('creating a post with authorId snapshots name + avatar', async () => {
    const authorId = createdAuthorIds[0];
    const res = await serambi.adminCreate({
      body: 'Post pakai penulis master',
      authorId,
      // manual authorName below must be overridden by the master snapshot
      authorName: 'Nama Manual Yang Diabaikan',
    });
    const post = data<{
      id: string;
      authorId: string;
      authorName: string;
      authorAvatarUrl: string;
    }>(res);
    createdPostIds.push(post.id);
    expect(post.authorId).toBe(authorId);
    expect(post.authorName).toBe(authorName);
    expect(post.authorAvatarUrl).toBe('/uploads/serambi/av.webp');
  });

  it('creating a post with a bogus authorId is rejected (400)', async () => {
    await expect(
      serambi.adminCreate({ body: 'x', authorId: 'does-not-exist' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("updating a post with authorId='' detaches but keeps the snapshot", async () => {
    const postId = createdPostIds[0];
    const res = await serambi.adminUpdate(postId, { authorId: '' });
    const post = data<{ authorId: string | null; authorName: string }>(res);
    expect(post.authorId).toBeNull();
    // snapshot name preserved (not wiped)
    expect(post.authorName).toBe(authorName);
  });

  it('deleting an author sets post.authorId to null and keeps the post', async () => {
    // fresh author + post to delete cleanly
    const a = data<{ id: string }>(
      await serambi.adminCreateAuthor({ name: `Del ${pid}` }),
    );
    const p = data<{ id: string }>(
      await serambi.adminCreate({ body: 'del-test', authorId: a.id }),
    );
    createdPostIds.push(p.id);

    await serambi.adminRemoveAuthor(a.id);

    const post = await prisma.serambiPost.findUnique({ where: { id: p.id } });
    expect(post).not.toBeNull();
    expect(post?.authorId).toBeNull();

    const gone = await prisma.serambiAuthor.findUnique({ where: { id: a.id } });
    expect(gone).toBeNull();
  });

  it('lists authors with post counts and activeOnly filter', async () => {
    const res = await serambi.adminListAuthors({ activeOnly: true });
    const rows = data<Array<{ id: string; _count: { posts: number } }>>(res);
    expect(Array.isArray(rows)).toBe(true);
    const mine = rows.find((r) => r.id === createdAuthorIds[0]);
    expect(mine).toBeDefined();
    expect(typeof mine?._count.posts).toBe('number');
  });
});
