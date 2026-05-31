import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Verifies the API-usage analytics logic and the global Prisma-error mapping.
 *
 * We test the service layer directly (no HTTP/auth/register) so the assertions
 * are deterministic: we seed ApiRequestLog rows, then check getApiUsage() and
 * rollupAndPurgeApiUsage() compute the right aggregates. The interceptor that
 * writes those rows in production is exercised separately; here we focus on the
 * read/rollup math and the error filter.
 */
describe('API usage analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let analytics: AnalyticsService;

  const APP_NAME = 'e2e-apiusage';
  const KEY_A = 'e2e-apiusage-A';
  const KEY_B = 'e2e-apiusage-B';

  // Full wipe of the analytics tables (test DB only) so the "all apps" totals
  // are deterministic regardless of rows left behind by other/earlier runs.
  const cleanup = async () => {
    await prisma.apiRequestLog.deleteMany({});
    await prisma.apiUsageDaily.deleteMany({});
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    analytics = app.get(AnalyticsService);
    await cleanup();

    const now = new Date();
    const mk = (
      apiKeyId: string,
      statusCode: number,
      latencyMs: number,
      platform: string,
      createdAt: Date,
      endpoint = '/api/v1/quran/surah/:nomor',
    ) =>
      prisma.apiRequestLog.create({
        data: {
          apiKeyId,
          appName: APP_NAME,
          method: 'GET',
          endpoint,
          statusCode,
          latencyMs,
          platform,
          createdAt,
        },
      });

    // Today: 3 rows for KEY_A (one error) + 1 for KEY_B.
    await mk(KEY_A, 200, 10, 'android', now);
    await mk(KEY_A, 200, 30, 'android', now);
    await mk(KEY_A, 500, 50, 'android', now, '/api/v1/doa');
    await mk(KEY_B, 200, 20, 'web', now);
    // Yesterday: 1 row for KEY_A (used by the rollup test).
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    await mk(KEY_A, 200, 40, 'android', yesterday);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('aggregates usage across all apps', async () => {
    const res = (await analytics.getApiUsage(7)) as {
      data: {
        headline: {
          totalRange: number;
          errorRange: number;
          errorRatePct: number;
          activeApps: number;
          avgLatencyMs: number;
        };
        daily: unknown[];
        apps: { apiKeyId: string; requests: number }[];
        platforms: { platform: string; requests: number }[];
        statusClasses: { klass: string; requests: number }[];
        topEndpoints: unknown[];
        recentErrors: unknown[];
      };
    };
    const d = res.data;
    expect(d.daily.length).toBe(7);
    // Our 5 rows (4 today + 1 yesterday) are all within the 7-day window.
    expect(d.headline.totalRange).toBe(5);
    expect(d.headline.errorRange).toBe(1); // exactly one 5xx row
    expect(d.headline.errorRatePct).toBe(20); // 1/5
    expect(d.headline.activeApps).toBe(2);
    const fxx = d.statusClasses.find((s) => s.klass === '5xx');
    expect(fxx?.requests).toBe(1);
    expect(d.recentErrors.length).toBe(1);
    // Active end-users fields present (no userId seeded → 0 / empty).
    expect(typeof (d.headline as { activeUsers?: number }).activeUsers).toBe(
      'number',
    );
    expect(
      Array.isArray((d as { topUsers?: unknown[] }).topUsers),
    ).toBe(true);
  });

  it('filters by appId', async () => {
    const a = (await analytics.getApiUsage(7, KEY_A)) as {
      data: { headline: { totalRange: number } };
    };
    const b = (await analytics.getApiUsage(7, KEY_B)) as {
      data: { headline: { totalRange: number } };
    };
    const none = (await analytics.getApiUsage(7, 'does-not-exist')) as {
      data: { headline: { totalRange: number } };
    };
    expect(a.data.headline.totalRange).toBe(4); // 3 today + 1 yesterday
    expect(b.data.headline.totalRange).toBe(1);
    expect(none.data.headline.totalRange).toBe(0);
  });

  it('rolls up completed days into the permanent daily aggregate (idempotent)', async () => {
    const first = await analytics.rollupAndPurgeApiUsage();
    expect(first.rolled).toBeGreaterThanOrEqual(1);

    const daily = await prisma.apiUsageDaily.findMany({
      where: { appName: APP_NAME },
    });
    // Yesterday's KEY_A row should have produced exactly one aggregate row.
    expect(daily.length).toBeGreaterThanOrEqual(1);
    const row = daily.find((r) => r.apiKeyId === KEY_A);
    expect(row).toBeDefined();
    expect(row!.requests).toBe(1);

    // Running again must not duplicate (ON CONFLICT update path).
    await analytics.rollupAndPurgeApiUsage();
    const daily2 = await prisma.apiUsageDaily.findMany({
      where: { appName: APP_NAME },
    });
    expect(daily2.length).toBe(daily.length);
  });

  it('maps a Prisma P2002 unique violation to 409, not a raw 500', () => {
    const filter = new AllExceptionsFilter();
    let statusCode = 0;
    let body: { success: boolean; error: string; statusCode: number } | null =
      null;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: (c: number) => {
            statusCode = c;
            return {
              json: (b: typeof body) => {
                body = b;
              },
            };
          },
        }),
        getRequest: () => ({ method: 'POST', url: '/x' }),
      }),
    };
    const err = new Prisma.PrismaClientKnownRequestError('Unique failed', {
      code: 'P2002',
      clientVersion: '6',
      meta: { target: ['email'] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter.catch(err, host as any);
    expect(statusCode).toBe(409);
    expect(body!.error).toBe('CONFLICT');
    expect(body!.success).toBe(false);
  });
});
