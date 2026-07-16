import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SerambiService } from '../src/modules/serambi/serambi.service';

/**
 * Verifies Serambi scheduled posting:
 *  - create status=scheduled + future time → stays scheduled, not in public feed
 *  - a past/empty scheduled time collapses to published immediately
 *  - promoteDueScheduled() promotes due posts to published (and into the feed)
 *  - editing a scheduled post's time keeps it scheduled
 * Service-level style (no HTTP/guards).
 */
describe('Serambi scheduled (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let serambi: SerambiService;

  const pid = process.pid;
  const createdPostIds: string[] = [];

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
    await app.close();
  });

  const data = <T>(res: { data: unknown }) => res.data as T;
  const track = (r: { data: unknown }) => {
    const row = r.data as { id: string };
    createdPostIds.push(row.id);
    return row;
  };
  /** Bypass the 30s sweep throttle so each test can force a promotion. */
  const resetSweep = () =>
    ((serambi as unknown as { lastScheduledSweep: number }).lastScheduledSweep = 0);

  it('create scheduled with a future time stays scheduled and is hidden from feed', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const post = track(
      await serambi.adminCreate({
        body: `terjadwal masa depan ${pid}`,
        status: 'scheduled',
        scheduledAt: future,
      }),
    ) as { id: string; status: string; scheduledAt: string | null };
    expect(post.status).toBe('scheduled');
    expect(post.scheduledAt).not.toBeNull();

    // Not visible in the public feed while scheduled.
    resetSweep();
    const feed = data<Array<{ id: string }>>(
      await serambi.listPublic({ page: 1, limit: 100 }, null),
    );
    expect(feed.find((p) => p.id === post.id)).toBeUndefined();
  });

  it('create scheduled with a past time publishes immediately', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const post = track(
      await serambi.adminCreate({
        body: `terjadwal lampau ${pid}`,
        status: 'scheduled',
        scheduledAt: past,
      }),
    ) as { status: string; scheduledAt: string | null };
    expect(post.status).toBe('published');
    expect(post.scheduledAt).toBeNull();
  });

  it('promoteDueScheduled publishes a due post and surfaces it in the feed', async () => {
    // Create a scheduled post then move its time into the past directly.
    const post = track(
      await serambi.adminCreate({
        body: `promosikan aku ${pid}`,
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    ) as { id: string };
    await prisma.serambiPost.update({
      where: { id: post.id },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });

    resetSweep();
    await serambi.promoteDueScheduled();

    const row = await prisma.serambiPost.findUnique({ where: { id: post.id } });
    expect(row?.status).toBe('published');
    expect(row?.scheduledAt).toBeNull();

    resetSweep();
    const feed = data<Array<{ id: string }>>(
      await serambi.listPublic({ page: 1, limit: 100 }, null),
    );
    expect(feed.find((p) => p.id === post.id)).toBeDefined();
  });

  it('editing keeps a post scheduled when a future time is set', async () => {
    const post = track(await serambi.adminCreate({ body: `draft ${pid}`, status: 'draft' })) as {
      id: string;
    };
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const res = await serambi.adminUpdate(post.id, {
      status: 'scheduled',
      scheduledAt: future,
    });
    const updated = data<{ status: string; scheduledAt: string | null }>(res);
    expect(updated.status).toBe('scheduled');
    expect(updated.scheduledAt).not.toBeNull();
  });
});
