import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { createHash, randomBytes } from 'crypto';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { PageViewDto } from './dto/pageview.dto';

interface ParsedUA {
  device: 'mobile' | 'tablet' | 'desktop' | 'bot';
  browser: string;
  os: string;
}

/** Tiny UA parser — no library, just regex. Covers the common cases. */
function parseUA(ua: string | undefined): ParsedUA {
  const u = (ua ?? '').toLowerCase();
  if (!u) return { device: 'desktop', browser: 'other', os: 'other' };

  // Bot detection (rough): known crawler strings.
  if (
    /(bot|crawler|spider|slurp|google-inspectiontool|facebookexternalhit|whatsapp|telegrambot|preview|fetch|monitor)/i.test(
      u,
    )
  ) {
    return { device: 'bot', browser: 'other', os: 'other' };
  }

  // Device class.
  let device: ParsedUA['device'] = 'desktop';
  if (/tablet|ipad/.test(u)) device = 'tablet';
  else if (/mobi|android.*mobile|iphone|ipod/.test(u)) device = 'mobile';

  // Browser family. Order matters — UAs include multiple tokens.
  let browser = 'other';
  if (/edg\//.test(u)) browser = 'edge';
  else if (/opr\/|opera/.test(u)) browser = 'opera';
  else if (/chrome|crios/.test(u)) browser = 'chrome';
  else if (/fxios|firefox/.test(u)) browser = 'firefox';
  else if (/safari/.test(u)) browser = 'safari';

  // OS.
  let os = 'other';
  if (/android/.test(u)) os = 'android';
  else if (/iphone|ipad|ipod/.test(u)) os = 'ios';
  else if (/windows/.test(u)) os = 'windows';
  else if (/mac os x|macintosh/.test(u)) os = 'macos';
  else if (/linux/.test(u)) os = 'linux';

  return { device, browser, os };
}

/** Pick the highest-weighted language tag from Accept-Language and map it
 *  to a 2-char country guess. Indonesian-leaning fallback "id". */
function pickCountry(acceptLang: string | undefined): string {
  if (!acceptLang) return 'id';
  const top = acceptLang.split(',')[0]?.trim();
  if (!top) return 'id';
  const m = /^[a-z]{2,3}(?:-([a-z]{2}))?/i.exec(top);
  if (m?.[1]) return m[1].toUpperCase();
  const lang = (m?.[0] ?? '').toLowerCase().slice(0, 2);
  // Common language → country guesses.
  return (
    {
      id: 'ID',
      en: 'US',
      ms: 'MY',
      ar: 'SA',
      ja: 'JP',
      ko: 'KR',
      zh: 'CN',
      es: 'ES',
      pt: 'BR',
      fr: 'FR',
      de: 'DE',
      ru: 'RU',
      tr: 'TR',
      vi: 'VN',
      th: 'TH',
    }[lang] ?? lang.toUpperCase()
  );
}

/** First 2 IP octets only (e.g. "203.142.x.x") — for dedup/fraud heuristics,
 *  not enough to re-identify a visitor. Hashed to avoid storing raw IPs. */
function buildHint(ip: string | undefined, ua: string | undefined): string {
  if (!ip) return '';
  const trimmed = ip.split(',')[0]?.trim() ?? '';
  const parts = trimmed.split('.').slice(0, 2).join('.');
  const seed = `${parts}|${(ua ?? '').slice(0, 40)}`;
  return createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a single page view. Never throws — analytics failures must not
   * break the actual page load.
   */
  async track(
    req: Request,
    dto: PageViewDto,
    userId?: string,
  ): Promise<ResponsePayload<unknown>> {
    try {
      const ua = (req.headers['user-agent'] as string) ?? '';
      const { device, browser, os } = parseUA(ua);
      const country = pickCountry(req.headers['accept-language'] as string);
      const sessionId =
        dto.sessionId && dto.sessionId.length >= 8
          ? dto.sessionId.slice(0, 64)
          : randomBytes(8).toString('hex');
      const ipHeader =
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress ||
        '';
      const clientHint = buildHint(ipHeader, ua);
      // Strip query, fragment, normalise trailing slash (root "/" stays "/").
      const cleanPath = dto.path
        .split(/[?#]/)[0]
        .replace(/\/+$/, '')
        .slice(0, 255) || '/';

      await this.prisma.pageView.create({
        data: {
          path: cleanPath,
          userId: userId ?? null,
          sessionId,
          referer: (dto.referer ?? '').slice(0, 500) || null,
          device,
          browser,
          os,
          country,
          clientHint: clientHint || null,
        },
      });
      return ok({ sessionId }, 'tracked');
    } catch (err) {
      // Swallow but log — never propagate to the user request.
      this.logger.warn(`page-view track failed: ${(err as Error).message}`);
      return ok({ tracked: false }, 'tracked (degraded)');
    }
  }

  /** Aggregate dashboard payload for /admin/analytics/traffic. */
  async getTraffic(rangeDays = 7): Promise<ResponsePayload<unknown>> {
    const days = [1, 7, 30, 90].includes(rangeDays) ? rangeDays : 7;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const today = new Date(Date.now() - 24 * 3600 * 1000);
    const realtimeSince = new Date(Date.now() - 5 * 60 * 1000);

    // Headline counters.
    const [totalRange, totalToday, uniqueRange, uniqueToday, realtimeActive] =
      await Promise.all([
        this.prisma.pageView.count({ where: { createdAt: { gte: since } } }),
        this.prisma.pageView.count({ where: { createdAt: { gte: today } } }),
        this.prisma.pageView
          .findMany({
            where: { createdAt: { gte: since } },
            distinct: ['sessionId'],
            select: { sessionId: true },
          })
          .then((rows) => rows.length),
        this.prisma.pageView
          .findMany({
            where: { createdAt: { gte: today } },
            distinct: ['sessionId'],
            select: { sessionId: true },
          })
          .then((rows) => rows.length),
        this.prisma.pageView
          .findMany({
            where: { createdAt: { gte: realtimeSince } },
            distinct: ['sessionId'],
            select: { sessionId: true },
          })
          .then((rows) => rows.length),
      ]);

    // Daily series (one row per day).
    const daily = await this.prisma.$queryRaw<
      { d: Date; views: bigint; uniques: bigint }[]
    >`
      SELECT date_trunc('day', "createdAt") AS d,
             count(*) AS views,
             count(DISTINCT "sessionId") AS uniques
      FROM page_views
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    // Top paths.
    const topPaths = await this.prisma.pageView.groupBy({
      by: ['path'],
      where: { createdAt: { gte: since } },
      _count: { path: true },
      orderBy: { _count: { path: 'desc' } },
      take: 20,
    });

    // Top referrers (excluding null/empty).
    const topReferrers = await this.prisma.pageView.groupBy({
      by: ['referer'],
      where: { createdAt: { gte: since }, referer: { not: null } },
      _count: { referer: true },
      orderBy: { _count: { referer: 'desc' } },
      take: 10,
    });

    // Device split.
    const deviceSplit = await this.prisma.pageView.groupBy({
      by: ['device'],
      where: { createdAt: { gte: since } },
      _count: { device: true },
    });

    // Browser split.
    const browserSplit = await this.prisma.pageView.groupBy({
      by: ['browser'],
      where: { createdAt: { gte: since } },
      _count: { browser: true },
      orderBy: { _count: { browser: 'desc' } },
      take: 8,
    });

    // OS split.
    const osSplit = await this.prisma.pageView.groupBy({
      by: ['os'],
      where: { createdAt: { gte: since } },
      _count: { os: true },
      orderBy: { _count: { os: 'desc' } },
      take: 8,
    });

    // Country split.
    const countrySplit = await this.prisma.pageView.groupBy({
      by: ['country'],
      where: { createdAt: { gte: since } },
      _count: { country: true },
      orderBy: { _count: { country: 'desc' } },
      take: 10,
    });

    // Anon vs logged-in.
    const [anon, authed] = await Promise.all([
      this.prisma.pageView.count({
        where: { createdAt: { gte: since }, userId: null },
      }),
      this.prisma.pageView.count({
        where: { createdAt: { gte: since }, userId: { not: null } },
      }),
    ]);

    return ok(
      {
        rangeDays: days,
        headline: {
          totalRange,
          totalToday,
          uniqueRange,
          uniqueToday,
          realtimeActive,
          anonShare: totalRange > 0 ? Math.round((anon / totalRange) * 1000) / 10 : 0,
          authedShare:
            totalRange > 0 ? Math.round((authed / totalRange) * 1000) / 10 : 0,
        },
        daily: daily.map((r) => ({
          date: r.d.toISOString().slice(0, 10),
          views: Number(r.views),
          uniques: Number(r.uniques),
        })),
        topPaths: topPaths.map((r) => ({
          path: r.path,
          views: r._count.path,
        })),
        topReferrers: topReferrers
          .map((r) => ({
            referer: r.referer ?? '',
            views: r._count.referer,
          }))
          .filter((r) => r.referer),
        deviceSplit: deviceSplit.map((r) => ({
          device: r.device,
          views: r._count.device,
        })),
        browserSplit: browserSplit.map((r) => ({
          browser: r.browser ?? 'other',
          views: r._count.browser,
        })),
        osSplit: osSplit.map((r) => ({
          os: r.os ?? 'other',
          views: r._count.os,
        })),
        countrySplit: countrySplit.map((r) => ({
          country: r.country ?? 'XX',
          views: r._count.country,
        })),
      },
      'Web traffic analytics',
    );
  }

  /** Realtime: visitors active in the last 5 minutes + paths they're on. */
  async getRealtime(): Promise<ResponsePayload<unknown>> {
    const since = new Date(Date.now() - 5 * 60 * 1000);
    const [rows, byPath] = await Promise.all([
      this.prisma.pageView
        .findMany({
          where: { createdAt: { gte: since } },
          distinct: ['sessionId'],
          select: { sessionId: true },
        })
        .then((r) => r.length),
      this.prisma.pageView.groupBy({
        by: ['path'],
        where: { createdAt: { gte: since } },
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: 10,
      }),
    ]);
    return ok(
      {
        activeNow: rows,
        topPaths: byPath.map((r) => ({ path: r.path, views: r._count.path })),
        windowSeconds: 300,
      },
      'Realtime traffic',
    );
  }

  // ───────────────────────── API usage analytics ─────────────────────────

  /**
   * Per-app API usage dashboard. Combines the permanent daily aggregate (older
   * days) with a live aggregation of today's raw rows, so figures always
   * include the current day even though the rollup runs overnight. Top
   * endpoints / status / latency percentiles come from the raw log and so
   * reflect at most the retention window (~7 days).
   */
  async getApiUsage(
    rangeDays = 7,
    appId?: string,
  ): Promise<ResponsePayload<unknown>> {
    const RETENTION = 7;
    const days = [1, 7, 30, 90].includes(rangeDays) ? rangeDays : 7;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const sinceDate = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
    // Pull the previous equal-length window too, for period-over-period trend.
    const prevSince = new Date(
      todayStart.getTime() - (2 * days - 1) * 86_400_000,
    );
    const rawSince = new Date(
      todayStart.getTime() - (Math.min(days, RETENTION) - 1) * 86_400_000,
    );
    const keyWhere = appId ? { apiKeyId: appId } : {};

    // Current + previous window in one fetch; split by date.
    const allBuckets = await this.fetchUsageBuckets(prevSince, rawSince, appId);
    const sinceKey = sinceDate.toISOString().slice(0, 10);
    const buckets = allBuckets.filter((b) => b.dateKey >= sinceKey);
    const prevBuckets = allBuckets.filter((b) => b.dateKey < sinceKey);
    const todayKey = todayStart.toISOString().slice(0, 10);

    // Headline (current window).
    const totalRange = buckets.reduce((s, b) => s + b.requests, 0);
    const errorRange = buckets.reduce((s, b) => s + b.errors, 0);
    const sumLatency = buckets.reduce((s, b) => s + b.sumLatencyMs, 0);
    const avgLatencyMs = totalRange ? Math.round(sumLatency / totalRange) : 0;
    const totalToday = buckets
      .filter((b) => b.dateKey === todayKey)
      .reduce((s, b) => s + b.requests, 0);
    const activeApps = new Set(buckets.map((b) => b.apiKeyId)).size;

    // Previous-window totals → trend (% change vs the prior equal period).
    const prevReq = prevBuckets.reduce((s, b) => s + b.requests, 0);
    const prevErr = prevBuckets.reduce((s, b) => s + b.errors, 0);
    const prevLatSum = prevBuckets.reduce((s, b) => s + b.sumLatencyMs, 0);
    const trend = {
      requests: pctChange(totalRange, prevReq),
      errorRate: pctChange(pct(errorRange, totalRange), pct(prevErr, prevReq)),
      latency: pctChange(
        avgLatencyMs,
        prevReq ? Math.round(prevLatSum / prevReq) : 0,
      ),
    };

    // Daily series (current window, zero-filled).
    const dailyMap = new Map<string, { requests: number; errors: number }>();
    for (const b of buckets) {
      const cur = dailyMap.get(b.dateKey) ?? { requests: 0, errors: 0 };
      cur.requests += b.requests;
      cur.errors += b.errors;
      dailyMap.set(b.dateKey, cur);
    }
    const daily: { date: string; requests: number; errors: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(sinceDate.getTime() + i * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const v = dailyMap.get(d) ?? { requests: 0, errors: 0 };
      daily.push({ date: d, requests: v.requests, errors: v.errors });
    }

    // Per-app split.
    const appMap = new Map<
      string,
      { appName: string; requests: number; errors: number; sumLatencyMs: number }
    >();
    for (const b of buckets) {
      const cur = appMap.get(b.apiKeyId) ?? {
        appName: b.appName,
        requests: 0,
        errors: 0,
        sumLatencyMs: 0,
      };
      cur.appName = b.appName || cur.appName;
      cur.requests += b.requests;
      cur.errors += b.errors;
      cur.sumLatencyMs += b.sumLatencyMs;
      appMap.set(b.apiKeyId, cur);
    }

    // Per-key metadata (rate limit + last-used) and peak req/min in the raw
    // window — used to show "usage vs limit" and to raise health alerts.
    const [keyRows, peakRows] = await Promise.all([
      this.prisma.apiKey.findMany({
        select: {
          id: true,
          name: true,
          rateLimit: true,
          enabled: true,
          lastUsedAt: true,
        },
      }),
      appId
        ? this.prisma.$queryRaw<{ apiKeyId: string; peak: number }[]>`
            SELECT "apiKeyId", max(c)::int AS peak FROM (
              SELECT "apiKeyId", date_trunc('minute', "createdAt") m, count(*) c
              FROM api_request_logs
              WHERE "createdAt" >= ${rawSince} AND "apiKeyId" = ${appId}
              GROUP BY 1, 2
            ) s GROUP BY 1`
        : this.prisma.$queryRaw<{ apiKeyId: string; peak: number }[]>`
            SELECT "apiKeyId", max(c)::int AS peak FROM (
              SELECT "apiKeyId", date_trunc('minute', "createdAt") m, count(*) c
              FROM api_request_logs
              WHERE "createdAt" >= ${rawSince}
              GROUP BY 1, 2
            ) s GROUP BY 1`,
    ]);
    const keyById = new Map(keyRows.map((k) => [k.id, k]));
    const peakById = new Map(peakRows.map((r) => [r.apiKeyId, Number(r.peak)]));

    const apps = [...appMap.entries()]
      .map(([apiKeyId, v]) => ({
        apiKeyId,
        appName: v.appName,
        requests: v.requests,
        errors: v.errors,
        errorRatePct: pct(v.errors, v.requests),
        avgLatencyMs: v.requests ? Math.round(v.sumLatencyMs / v.requests) : 0,
        rateLimit: keyById.get(apiKeyId)?.rateLimit ?? 0,
        peakRpm: peakById.get(apiKeyId) ?? 0,
      }))
      .sort((a, b) => b.requests - a.requests);

    // Platform split.
    const platMap = new Map<string, number>();
    for (const b of buckets)
      platMap.set(b.platform, (platMap.get(b.platform) ?? 0) + b.requests);
    const platforms = [...platMap.entries()]
      .map(([platform, requests]) => ({ platform, requests }))
      .sort((a, b) => b.requests - a.requests);

    // Raw-only extras (last ≤7 days).
    const [statusRows, topEndpointRows, topEndpointErrRows, recentErrors, p95] =
      await Promise.all([
        this.prisma.apiRequestLog.groupBy({
          by: ['statusCode'],
          where: { createdAt: { gte: rawSince }, ...keyWhere },
          _count: { _all: true },
        }),
        this.prisma.apiRequestLog.groupBy({
          by: ['method', 'endpoint'],
          where: { createdAt: { gte: rawSince }, ...keyWhere },
          _count: { _all: true },
          _avg: { latencyMs: true },
          orderBy: { _count: { endpoint: 'desc' } },
          take: 15,
        }),
        this.prisma.apiRequestLog.groupBy({
          by: ['method', 'endpoint'],
          where: {
            createdAt: { gte: rawSince },
            statusCode: { gte: 400 },
            ...keyWhere,
          },
          _count: { _all: true },
        }),
        this.prisma.apiRequestLog.findMany({
          where: {
            createdAt: { gte: rawSince },
            statusCode: { gte: 400 },
            ...keyWhere,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            createdAt: true,
            method: true,
            endpoint: true,
            statusCode: true,
            appName: true,
          },
        }),
        this.apiLatencyP95(rawSince, appId),
      ]);

    // Active END-USERS (authenticated) hitting the API + top users, from the
    // raw log (≤7d) — API logs only carry a userId for authenticated requests.
    const [activeUserRows, topUserRows] = await Promise.all([
      this.prisma.apiRequestLog.findMany({
        where: {
          createdAt: { gte: rawSince },
          userId: { not: null },
          ...keyWhere,
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.apiRequestLog.groupBy({
        by: ['userId'],
        where: {
          createdAt: { gte: rawSince },
          userId: { not: null },
          ...keyWhere,
        },
        _count: { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ]);
    const activeUsers = activeUserRows.length;
    const topUserIds = topUserRows
      .map((r) => r.userId)
      .filter((id): id is string => !!id);
    const userRows = topUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, nama: true, email: true },
        })
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));
    const topUsers = topUserRows
      .filter((r) => r.userId)
      .map((r) => ({
        userId: r.userId as string,
        name: userById.get(r.userId as string)?.nama ?? '(tidak dikenal)',
        email: userById.get(r.userId as string)?.email ?? '',
        requests: r._count._all,
      }));

    const statusClasses = aggregateStatusClasses(
      statusRows.map((r) => ({
        statusCode: r.statusCode,
        count: r._count._all,
      })),
    );
    const errByEndpoint = new Map(
      topEndpointErrRows.map((r) => [`${r.method} ${r.endpoint}`, r._count._all]),
    );
    const topEndpoints = topEndpointRows.map((r) => {
      const requests = r._count._all;
      const errors = errByEndpoint.get(`${r.method} ${r.endpoint}`) ?? 0;
      return {
        method: r.method,
        endpoint: r.endpoint,
        requests,
        avgLatencyMs: Math.round(r._avg.latencyMs ?? 0),
        errorRatePct: pct(errors, requests),
      };
    });

    // Health alerts surfaced as a dashboard banner.
    const alerts: { type: string; appName: string; detail: string }[] = [];
    const staleCutoff = Date.now() - 24 * 3600 * 1000;
    for (const k of keyRows) {
      if (k.enabled && k.lastUsedAt && k.lastUsedAt.getTime() < staleCutoff) {
        alerts.push({
          type: 'stale',
          appName: k.name,
          detail: `tidak ada request > 24 jam (terakhir ${k.lastUsedAt
            .toISOString()
            .slice(0, 16)
            .replace('T', ' ')} UTC)`,
        });
      }
    }
    for (const a of apps) {
      if (a.requests >= 20 && a.errorRatePct >= 30) {
        alerts.push({
          type: 'error_spike',
          appName: a.appName,
          detail: `error rate ${a.errorRatePct}% (${a.errors}/${a.requests})`,
        });
      }
      if (a.rateLimit > 0 && a.peakRpm > a.rateLimit) {
        alerts.push({
          type: 'rate_limit',
          appName: a.appName,
          detail: `puncak ${a.peakRpm} req/menit melebihi limit ${a.rateLimit}`,
        });
      }
    }

    return ok(
      {
        rangeDays: days,
        retentionDays: RETENTION,
        headline: {
          totalRange,
          totalToday,
          errorRange,
          errorRatePct: pct(errorRange, totalRange),
          avgLatencyMs,
          p95LatencyMs: p95,
          activeApps,
          activeUsers,
          trend,
        },
        alerts,
        topUsers,
        daily,
        apps,
        platforms,
        statusClasses,
        topEndpoints,
        recentErrors: recentErrors.map((r) => ({
          createdAt: r.createdAt.toISOString(),
          method: r.method,
          endpoint: r.endpoint,
          statusCode: r.statusCode,
          appName: r.appName,
        })),
      },
      'API usage analytics',
    );
  }

  /**
   * Fetch usage buckets for [fetchSince, now]: the permanent aggregate for days
   * older than the raw retention window, the raw log for recent days. No gap
   * and no double counting (rawSince is the boundary).
   */
  private async fetchUsageBuckets(
    fetchSince: Date,
    rawSince: Date,
    appId?: string,
  ): Promise<UsageBucket[]> {
    const keyWhere = appId ? { apiKeyId: appId } : {};
    const pastDaily =
      rawSince.getTime() > fetchSince.getTime()
        ? await this.prisma.apiUsageDaily.findMany({
            where: { date: { gte: fetchSince, lt: rawSince }, ...keyWhere },
          })
        : [];
    const rawRows = appId
      ? await this.prisma.$queryRaw<RawBucketRow[]>`
          SELECT date_trunc('day', "createdAt")::date AS d, "apiKeyId",
                 max("appName") AS "appName", "platform",
                 count(*)::int AS requests,
                 count(*) FILTER (WHERE "statusCode" >= 400)::int AS errors,
                 coalesce(sum("latencyMs"), 0)::bigint AS "sumLatencyMs"
          FROM api_request_logs
          WHERE "createdAt" >= ${rawSince} AND "apiKeyId" = ${appId}
          GROUP BY 1, 2, 4`
      : await this.prisma.$queryRaw<RawBucketRow[]>`
          SELECT date_trunc('day', "createdAt")::date AS d, "apiKeyId",
                 max("appName") AS "appName", "platform",
                 count(*)::int AS requests,
                 count(*) FILTER (WHERE "statusCode" >= 400)::int AS errors,
                 coalesce(sum("latencyMs"), 0)::bigint AS "sumLatencyMs"
          FROM api_request_logs
          WHERE "createdAt" >= ${rawSince}
          GROUP BY 1, 2, 4`;
    return [
      ...pastDaily.map((r) => ({
        dateKey: r.date.toISOString().slice(0, 10),
        apiKeyId: r.apiKeyId,
        appName: r.appName,
        platform: r.platform,
        requests: r.requests,
        errors: r.errors,
        sumLatencyMs: Number(r.sumLatencyMs),
      })),
      ...rawRows.map((r) => ({
        dateKey: new Date(r.d).toISOString().slice(0, 10),
        apiKeyId: r.apiKeyId,
        appName: r.appName,
        platform: r.platform,
        requests: Number(r.requests),
        errors: Number(r.errors),
        sumLatencyMs: Number(r.sumLatencyMs),
      })),
    ];
  }

  /** CSV of per-day-per-app usage for the range (for the export button). */
  async exportApiUsageCsv(rangeDays = 7, appId?: string): Promise<string> {
    const RETENTION = 7;
    const days = [1, 7, 30, 90].includes(rangeDays) ? rangeDays : 7;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const sinceDate = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
    const rawSince = new Date(
      todayStart.getTime() - (Math.min(days, RETENTION) - 1) * 86_400_000,
    );
    const buckets = (
      await this.fetchUsageBuckets(sinceDate, rawSince, appId)
    ).sort(
      (a, b) =>
        (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0) ||
        b.requests - a.requests,
    );
    const header = [
      'Tanggal',
      'App',
      'Platform',
      'Requests',
      'Errors',
      'Error %',
      'Avg latency (ms)',
    ];
    const rows = buckets.map((b) => [
      b.dateKey,
      b.appName,
      b.platform,
      b.requests,
      b.errors,
      pct(b.errors, b.requests),
      b.requests ? Math.round(b.sumLatencyMs / b.requests) : 0,
    ]);
    return toCsv([header, ...rows]);
  }

  /** p95 latency (ms) over the raw window. Returns 0 when there's no data. */
  private async apiLatencyP95(since: Date, appId?: string): Promise<number> {
    const rows = appId
      ? await this.prisma.$queryRaw<{ p95: number | null }[]>`
          SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
          FROM api_request_logs
          WHERE "createdAt" >= ${since} AND "apiKeyId" = ${appId}
        `
      : await this.prisma.$queryRaw<{ p95: number | null }[]>`
          SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
          FROM api_request_logs
          WHERE "createdAt" >= ${since}
        `;
    return Math.round(Number(rows[0]?.p95 ?? 0));
  }

  /**
   * Roll completed days from the raw log into the permanent daily aggregate,
   * then purge raw rows older than the retention window. Idempotent — re-running
   * for the same day overwrites that day's aggregate.
   */
  async rollupAndPurgeApiUsage(
    retentionDays = 7,
  ): Promise<{ rolled: number; purged: number }> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today.getTime() - retentionDays * 86_400_000);

    const rolled = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO api_usage_daily
        ("date","apiKeyId","appName","platform","requests","errors","sumLatencyMs","maxLatencyMs","createdAt","updatedAt")
      SELECT date_trunc('day',"createdAt")::date,
             "apiKeyId",
             max("appName"),
             "platform",
             count(*)::int,
             count(*) FILTER (WHERE "statusCode" >= 400)::int,
             coalesce(sum("latencyMs"),0)::bigint,
             coalesce(max("latencyMs"),0)::int,
             now(), now()
      FROM api_request_logs
      WHERE "createdAt" >= ${start} AND "createdAt" < ${today}
      GROUP BY 1,2,4
      ON CONFLICT ("date","apiKeyId","platform") DO UPDATE SET
        "requests"     = EXCLUDED."requests",
        "errors"       = EXCLUDED."errors",
        "appName"      = EXCLUDED."appName",
        "sumLatencyMs" = EXCLUDED."sumLatencyMs",
        "maxLatencyMs" = EXCLUDED."maxLatencyMs",
        "updatedAt"    = now()
    `);

    const purged = await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM api_request_logs WHERE "createdAt" < ${start}
    `);

    this.logger.log(
      `API usage rollup done: ${rolled} daily rows upserted, ${purged} raw logs purged`,
    );
    return { rolled: Number(rolled), purged: Number(purged) };
  }
}

/** Round a part/total ratio to a 1-decimal percentage. */
function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Bucket raw (statusCode, count) rows into 2xx/3xx/4xx/5xx classes. */
function aggregateStatusClasses(
  rows: { statusCode: number; count: number }[],
): { klass: string; requests: number }[] {
  const order = ['2xx', '3xx', '4xx', '5xx', 'other'];
  const m = new Map<string, number>();
  for (const r of rows) {
    const k =
      r.statusCode >= 200 && r.statusCode < 300
        ? '2xx'
        : r.statusCode >= 300 && r.statusCode < 400
          ? '3xx'
          : r.statusCode >= 400 && r.statusCode < 500
            ? '4xx'
            : r.statusCode >= 500
              ? '5xx'
              : 'other';
    m.set(k, (m.get(k) ?? 0) + r.count);
  }
  return order
    .filter((k) => m.has(k))
    .map((klass) => ({ klass, requests: m.get(klass)! }));
}

/** Normalised per-day-per-app-per-platform usage row. */
interface UsageBucket {
  dateKey: string;
  apiKeyId: string;
  appName: string;
  platform: string;
  requests: number;
  errors: number;
  sumLatencyMs: number;
}

/** Shape of a raw-log day bucket returned by the $queryRaw aggregation. */
type RawBucketRow = {
  d: Date;
  apiKeyId: string;
  appName: string;
  platform: string;
  requests: number;
  errors: number;
  sumLatencyMs: bigint;
};

/** Percentage change from prev → cur, 1 decimal. New-from-zero reads as +100%. */
function pctChange(cur: number, prev: number): number {
  if (!prev) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** Serialize rows to CSV with escaping + UTF-8 BOM so Excel opens it cleanly. */
function toCsv(rows: (string | number)[][]): string {
  const escape = (val: string | number): string => {
    const s = String(val ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  return `﻿${body}`;
}
