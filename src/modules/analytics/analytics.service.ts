import { Injectable, Logger } from '@nestjs/common';
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
}
