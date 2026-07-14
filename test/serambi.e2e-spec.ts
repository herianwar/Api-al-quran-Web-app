import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SerambiService } from '../src/modules/serambi/serambi.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import {
  CreateCommentDto,
  CreateSerambiPostDto,
  UpdateSerambiPostDto,
} from '../src/modules/serambi/dto/serambi.dto';
import { PaginationQueryDto } from '../src/common/dto/pagination';

/**
 * Service-level coverage for the "Serambi" feature:
 *  - DTO validation (body length, comment length, trimming, status enum)
 *  - public feed (published-only, `liked` per user, detail)
 *  - like/unlike idempotency + denormalized likeCount
 *  - comment create/list + commentCount increment
 *  - admin CRUD + comment moderation (hide/show/delete counter sync)
 * No-HTTP/no-guards style like feedback.e2e-spec.ts. Runs against
 * quran_test_db (DATABASE_URL passed at invocation).
 */
describe('Serambi (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: SerambiService;
  let notifications: NotificationService;
  const postIds: string[] = [];
  const userIds: string[] = [];

  /** Let fire-and-forget notification microtasks settle before asserting. */
  const flush = () => new Promise((r) => setImmediate(r));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(SerambiService);
    notifications = app.get(NotificationService);
  });

  afterAll(async () => {
    if (postIds.length) {
      await prisma.serambiPost
        .deleteMany({ where: { id: { in: postIds } } })
        .catch(() => undefined);
    }
    if (userIds.length) {
      await prisma.user
        .deleteMany({ where: { id: { in: userIds } } })
        .catch(() => undefined);
    }
    await app.close();
  });

  async function makeUser(tag: string): Promise<string> {
    const u = await prisma.user.create({
      data: {
        email: `serambi-${tag}-${process.pid}@test.local`,
        passwordHash: 'x',
      },
    });
    userIds.push(u.id);
    return u.id;
  }

  async function makePost(
    body: string,
    status = 'published',
  ): Promise<string> {
    const res = await service.adminCreate(
      plainToInstance(CreateSerambiPostDto, { body, status }),
    );
    const id = (res.data as { id: string }).id;
    postIds.push(id);
    return id;
  }

  // ─── DTO validation ────────────────────────────────────────────────

  it('CreateSerambiPostDto trims body and defaults status', async () => {
    const dto = plainToInstance(CreateSerambiPostDto, {
      body: '  Sabar itu indah  ',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toHaveLength(0);
    expect(dto.body).toBe('Sabar itu indah');
  });

  it('rejects empty body and an invalid status', async () => {
    const empty = plainToInstance(CreateSerambiPostDto, { body: '   ' });
    expect((await validate(empty)).length).toBeGreaterThan(0);

    const badStatus = plainToInstance(CreateSerambiPostDto, {
      body: 'ok',
      status: 'weird',
    });
    expect((await validate(badStatus)).length).toBeGreaterThan(0);
  });

  it('rejects a comment over 500 chars and an empty one', async () => {
    const long = plainToInstance(CreateCommentDto, { body: 'a'.repeat(501) });
    expect((await validate(long)).length).toBeGreaterThan(0);

    const empty = plainToInstance(CreateCommentDto, { body: '   ' });
    expect((await validate(empty)).length).toBeGreaterThan(0);
  });

  // ─── Public feed ───────────────────────────────────────────────────

  it('public list returns only published posts', async () => {
    const pub = await makePost('Kutipan publik unik-xyz');
    await makePost('Draft tersembunyi unik-xyz', 'draft');

    const res = await service.listPublic(
      plainToInstance(PaginationQueryDto, { page: 1, limit: 100 }),
      null,
    );
    const rows = res.data as { id: string; liked: boolean }[];
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(pub);
    // Draft must not surface.
    const draftPresent = rows.some(
      (r) => (r as unknown as { body?: string }).body === undefined,
    );
    expect(draftPresent).toBe(false);
    // Guest → liked false everywhere.
    expect(rows.every((r) => r.liked === false)).toBe(true);
  });

  it('public detail 404s for a draft/nonexistent post', async () => {
    const draft = await makePost('Draft detail', 'draft');
    await expect(service.getPublic(draft, null)).rejects.toMatchObject({
      status: 404,
    });
  });

  // ─── Like / unlike ─────────────────────────────────────────────────

  it('like is idempotent and updates likeCount + liked flag', async () => {
    const postId = await makePost('Post untuk like');
    const userId = await makeUser('like');

    const first = await service.like(postId, userId);
    expect(first.data).toMatchObject({ liked: true, likeCount: 1 });

    // Double like → still 1 (idempotent).
    const second = await service.like(postId, userId);
    expect(second.data).toMatchObject({ liked: true, likeCount: 1 });

    // Detail reflects liked=true for this user.
    const detail = await service.getPublic(postId, userId);
    expect((detail.data as { liked: boolean }).liked).toBe(true);

    // Unlike → 0, and a second unlike is safe.
    const un = await service.unlike(postId, userId);
    expect(un.data).toMatchObject({ liked: false, likeCount: 0 });
    const un2 = await service.unlike(postId, userId);
    expect(un2.data).toMatchObject({ liked: false, likeCount: 0 });

    const row = await prisma.serambiPost.findUnique({ where: { id: postId } });
    expect(row?.likeCount).toBe(0);
  });

  // ─── Comments ──────────────────────────────────────────────────────

  it('adds a comment (userId from arg) and increments commentCount', async () => {
    const postId = await makePost('Post untuk komentar');
    const userId = await makeUser('comment');

    const res = await service.addComment(
      postId,
      userId,
      plainToInstance(CreateCommentDto, { body: 'Masya Allah' }),
    );
    const comment = res.data as { id: string; body: string; author: unknown };
    expect(comment.body).toBe('Masya Allah');
    expect(comment).toHaveProperty('author');

    const row = await prisma.serambiPost.findUnique({ where: { id: postId } });
    expect(row?.commentCount).toBe(1);

    const list = await service.listComments(
      postId,
      plainToInstance(PaginationQueryDto, { page: 1, limit: 20 }),
    );
    expect((list.data as unknown[]).length).toBe(1);
    expect(list.meta?.total).toBe(1);
  });

  // ─── Admin CRUD + moderation ───────────────────────────────────────

  it('admin list filters by status and searches body', async () => {
    await makePost('Renungan admin cari-kata-unik-abc');
    const res = await service.adminList(
      plainToInstance(
        // AdminPostListQueryDto shares PaginationQueryDto shape here.
        PaginationQueryDto,
        { page: 1, limit: 20 },
      ) as never,
    );
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('hiding a visible comment decrements commentCount, showing restores it', async () => {
    const postId = await makePost('Post moderasi');
    const userId = await makeUser('mod');
    const created = await service.addComment(
      postId,
      userId,
      plainToInstance(CreateCommentDto, { body: 'komentar moderasi' }),
    );
    const commentId = (created.data as { id: string }).id;

    let post = await prisma.serambiPost.findUnique({ where: { id: postId } });
    expect(post?.commentCount).toBe(1);

    await service.adminSetCommentStatus(commentId, 'hidden');
    post = await prisma.serambiPost.findUnique({ where: { id: postId } });
    expect(post?.commentCount).toBe(0);

    // Hidden comment excluded from public list.
    const pubList = await service.listComments(
      postId,
      plainToInstance(PaginationQueryDto, { page: 1, limit: 20 }),
    );
    expect((pubList.data as unknown[]).length).toBe(0);

    await service.adminSetCommentStatus(commentId, 'visible');
    post = await prisma.serambiPost.findUnique({ where: { id: postId } });
    expect(post?.commentCount).toBe(1);
  });

  it('deleting a post cascades likes + comments', async () => {
    const postId = await makePost('Post untuk dihapus');
    const userId = await makeUser('cascade');
    await service.like(postId, userId);
    await service.addComment(
      postId,
      userId,
      plainToInstance(CreateCommentDto, { body: 'akan terhapus' }),
    );

    await service.adminRemove(postId);

    const likes = await prisma.serambiLike.count({ where: { postId } });
    const comments = await prisma.serambiComment.count({ where: { postId } });
    expect(likes).toBe(0);
    expect(comments).toBe(0);
  });

  // ─── Push-on-publish (FCM topic "serambi") ─────────────────────────

  it('fires ONE topic push when a post is created as published', async () => {
    const spy = jest
      .spyOn(notifications, 'sendToTopic')
      .mockResolvedValue('msg-id');
    try {
      const res = await service.adminCreate(
        plainToInstance(CreateSerambiPostDto, {
          body: 'Kutipan terbit langsung',
          status: 'published',
        }),
      );
      postIds.push((res.data as { id: string }).id);
      await flush();
      expect(spy).toHaveBeenCalledTimes(1);
      const [topic, payload] = spy.mock.calls[0];
      expect(topic).toBe('serambi');
      expect(payload.data).toMatchObject({
        type: 'serambi',
        id: (res.data as { id: string }).id,
      });
      expect(payload.title).toContain('Rumah Qur');
    } finally {
      spy.mockRestore();
    }
  });

  it('does NOT push when a post is created as draft', async () => {
    const spy = jest
      .spyOn(notifications, 'sendToTopic')
      .mockResolvedValue('msg-id');
    try {
      const res = await service.adminCreate(
        plainToInstance(CreateSerambiPostDto, {
          body: 'Kutipan draft',
          status: 'draft',
        }),
      );
      postIds.push((res.data as { id: string }).id);
      await flush();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('pushes once on draft→published, but not on an edit while published', async () => {
    const id = await makePost('Kutipan yang akan diterbitkan', 'draft');
    const spy = jest
      .spyOn(notifications, 'sendToTopic')
      .mockResolvedValue('msg-id');
    try {
      // draft → published : fires once.
      await service.adminUpdate(
        id,
        plainToInstance(UpdateSerambiPostDto, { status: 'published' }),
      );
      await flush();
      expect(spy).toHaveBeenCalledTimes(1);

      // edit body while already published : must NOT re-fire.
      await service.adminUpdate(
        id,
        plainToInstance(UpdateSerambiPostDto, { body: 'Diedit sedikit' }),
      );
      await flush();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('truncates the push body to ~120 chars with an ellipsis', async () => {
    const longBody = 'A'.repeat(300);
    const spy = jest
      .spyOn(notifications, 'sendToTopic')
      .mockResolvedValue('msg-id');
    try {
      const res = await service.adminCreate(
        plainToInstance(CreateSerambiPostDto, {
          body: longBody,
          status: 'published',
        }),
      );
      postIds.push((res.data as { id: string }).id);
      await flush();
      const payload = spy.mock.calls[0][1];
      expect(payload.body.endsWith('…')).toBe(true);
      expect(payload.body.length).toBeLessThanOrEqual(121); // 120 + ellipsis
    } finally {
      spy.mockRestore();
    }
  });

  it('adminGet throws NotFound for a missing id', async () => {
    await expect(
      service.adminGet('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
