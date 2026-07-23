import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SerambiService } from '../src/modules/serambi/serambi.service';

/**
 * Covers the admin Serambi list features added for the panel UI:
 *  - `?sort=` (disukai / dikomentari / terlama) reorders the list
 *  - `?authorId=` filters per master penulis, `none` = penulis manual
 *  - `?q=` juga mencocokkan nama penulis
 *  - aksi massal publish / draft / archive / author / delete
 *  - duplicate → salinan draft
 *  - adminStats() melaporkan jumlah per status, total suka/komentar, dll.
 * Service-level style like the other serambi specs (no HTTP/guards).
 */
describe('Serambi admin list, bulk & stats (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let serambi: SerambiService;

  const pid = process.pid;
  const postIds: string[] = [];
  const authorIds: string[] = [];
  let authorId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    serambi = app.get(SerambiService);

    const author = data<{ id: string }>(
      await serambi.adminCreateAuthor({ name: `Penulis Uji ${pid}` }),
    );
    authorId = author.id;
    authorIds.push(author.id);
  });

  afterAll(async () => {
    await prisma.serambiPost
      .deleteMany({ where: { id: { in: postIds } } })
      .catch(() => undefined);
    await prisma.serambiAuthor
      .deleteMany({ where: { id: { in: authorIds } } })
      .catch(() => undefined);
    await app.close();
  });

  const data = <T>(res: { data: unknown }) => res.data as T;

  async function make(
    suffix: string,
    over: Partial<{
      status: string;
      authorId: string;
      authorName: string;
      scheduledAt: string;
    }> = {},
  ) {
    const row = data<{ id: string }>(
      await serambi.adminCreate({
        body: `serambi adm ${pid} ${suffix}`,
        status: over.status ?? 'draft',
        ...(over.authorId ? { authorId: over.authorId } : {}),
        ...(over.authorName ? { authorName: over.authorName } : {}),
        ...(over.scheduledAt ? { scheduledAt: over.scheduledAt } : {}),
      }),
    );
    postIds.push(row.id);
    return row.id;
  }

  /** Ambil semua post uji (dibatasi lewat `q` unik per proses).
   *  page/limit diisi eksplisit — default DTO datang dari ValidationPipe,
   *  yang tidak ikut jalan saat service dipanggil langsung. */
  async function list(extra: Record<string, unknown> = {}) {
    return data<{ id: string; status: string; likeCount: number }[]>(
      await serambi.adminList({
        q: `serambi adm ${pid}`,
        page: 1,
        limit: 50,
        ...extra,
      } as never),
    );
  }

  it('memfilter per master penulis (dan "none" untuk penulis manual)', async () => {
    const withMaster = await make('a-master', { authorId });
    const manual = await make('b-manual', { authorName: `Manual ${pid}` });

    const byAuthor = await list({ authorId });
    expect(byAuthor.map((p) => p.id)).toContain(withMaster);
    expect(byAuthor.map((p) => p.id)).not.toContain(manual);

    const none = await list({ authorId: 'none' });
    expect(none.map((p) => p.id)).toContain(manual);
    expect(none.map((p) => p.id)).not.toContain(withMaster);
  });

  it('mencari juga di nama penulis', async () => {
    const rows = data<{ id: string }[]>(
      await serambi.adminList({
        q: `Penulis Uji ${pid}`,
        page: 1,
        limit: 50,
      } as never),
    );
    // Post yang memakai master penulis di atas ikut terjaring lewat authorName.
    expect(rows.length).toBeGreaterThan(0);
  });

  it('mengurutkan dengan ?sort=disukai dan ?sort=terlama', async () => {
    const popular = await make('c-populer');
    await prisma.serambiPost.update({
      where: { id: popular },
      data: { likeCount: 999, commentCount: 42 },
    });

    const bySuka = await list({ sort: 'disukai' });
    expect(bySuka[0].id).toBe(popular);

    const byKomentar = await list({ sort: 'dikomentari' });
    expect(byKomentar[0].id).toBe(popular);

    const terlama = await list({ sort: 'terlama' });
    const terbaru = await list({ sort: 'terbaru' });
    expect(terlama[0].id).toBe(terbaru[terbaru.length - 1].id);
  });

  it('aksi massal mengubah status sekumpulan post', async () => {
    const a = await make('d-bulk-1');
    const b = await make('e-bulk-2');

    const published = data<{ affected: number }>(
      await serambi.adminBulk({ ids: [a, b], action: 'publish' }),
    );
    expect(published.affected).toBe(2);
    let rows = await prisma.serambiPost.findMany({
      where: { id: { in: [a, b] } },
      select: { status: true, scheduledAt: true },
    });
    expect(rows.every((r) => r.status === 'published')).toBe(true);
    expect(rows.every((r) => r.scheduledAt === null)).toBe(true);

    await serambi.adminBulk({ ids: [a, b], action: 'archive' });
    rows = await prisma.serambiPost.findMany({
      where: { id: { in: [a, b] } },
      select: { status: true, scheduledAt: true },
    });
    expect(rows.every((r) => r.status === 'archived')).toBe(true);

    await serambi.adminBulk({ ids: [a], action: 'draft' });
    const one = await prisma.serambiPost.findUnique({
      where: { id: a },
      select: { status: true },
    });
    expect(one?.status).toBe('draft');
  });

  it('aksi massal "author" menyalin nama & avatar master penulis', async () => {
    const a = await make('f-author-bulk', { authorName: `Lama ${pid}` });
    await serambi.adminBulk({ ids: [a], action: 'author', authorId });
    const row = await prisma.serambiPost.findUnique({
      where: { id: a },
      select: { authorId: true, authorName: true },
    });
    expect(row?.authorId).toBe(authorId);
    expect(row?.authorName).toBe(`Penulis Uji ${pid}`);
  });

  it('aksi massal menolak id kosong dan authorId yang tidak ada', async () => {
    await expect(serambi.adminBulk({ ids: [], action: 'draft' })).rejects.toThrow();
    const a = await make('g-bad-author');
    await expect(
      serambi.adminBulk({
        ids: [a],
        action: 'author',
        authorId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow();
  });

  it('duplicate membuat salinan berstatus draft', async () => {
    const src = await make('h-source', { status: 'published', authorId });
    const copy = data<{ id: string; status: string; body: string; authorId: string | null }>(
      await serambi.adminDuplicate(src),
    );
    postIds.push(copy.id);
    expect(copy.id).not.toBe(src);
    expect(copy.status).toBe('draft');
    expect(copy.body).toBe(`serambi adm ${pid} h-source`);
    expect(copy.authorId).toBe(authorId);
  });

  it('adminStats melaporkan jumlah per status, total & penulis', async () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    await make('i-terjadwal', { status: 'scheduled', scheduledAt: future });

    const stats = data<{
      total: number;
      published: number;
      draft: number;
      scheduled: number;
      archived: number;
      manualAuthor: number;
      totalLikes: number;
      totalComments: number;
      comments: { total: number; hidden: number };
      nextScheduled: { id: string; scheduledAt: string | null } | null;
      topLiked: { id: string; likeCount: number }[];
      byAuthor: { id: string; name: string; jumlahPost: number }[];
    }>(await serambi.adminStats());

    expect(stats.total).toBeGreaterThanOrEqual(postIds.length);
    expect(stats.scheduled).toBeGreaterThanOrEqual(1);
    expect(stats.draft).toBeGreaterThanOrEqual(1);
    expect(stats.archived).toBeGreaterThanOrEqual(1);
    // Post uji "c-populer" punya 999 like → ikut mengangkat total & top-list.
    expect(stats.totalLikes).toBeGreaterThanOrEqual(999);
    expect(stats.totalComments).toBeGreaterThanOrEqual(42);
    expect(stats.manualAuthor).toBeGreaterThanOrEqual(1);
    expect(stats.nextScheduled).not.toBeNull();
    expect(stats.comments.total).toBeGreaterThanOrEqual(0);
    const mine = stats.byAuthor.find((a) => a.id === authorId);
    expect(mine?.jumlahPost).toBeGreaterThanOrEqual(2);
  });

  it('aksi massal delete menghapus semua id terpilih', async () => {
    const a = await make('j-del-1');
    const b = await make('k-del-2');
    const res = data<{ affected: number }>(
      await serambi.adminBulk({ ids: [a, b], action: 'delete' }),
    );
    expect(res.affected).toBe(2);
    const left = await prisma.serambiPost.count({ where: { id: { in: [a, b] } } });
    expect(left).toBe(0);
  });
});
