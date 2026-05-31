import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/** Shape attached to the request by ApiKeyGuard once a key is verified. */
interface VerifiedApiKey {
  id: string;
  name: string;
  scopes: string;
  rateLimit: number;
}

/**
 * Records one row per API request for per-app usage analytics. It is
 * deliberately fire-and-forget — the response is never delayed or failed by a
 * logging error.
 *
 * Only requests carrying a verified API key (set on `req.apiKey` by
 * ApiKeyGuard) are logged. Admin-panel traffic (authenticated with the static
 * seed key) and health checks (@SkipApiKey) never populate `req.apiKey`, so
 * they're excluded automatically — keeping the dataset to real consumer apps
 * (web frontend, Android, future iOS).
 *
 * Registered as the OUTERMOST global interceptor so the latency it measures
 * spans the whole handler + serialization, and the status it reads (via the
 * response `finish` event) is the final one written to the socket — including
 * 304s from the ETag interceptor and error codes from AllExceptionsFilter.
 */
@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiUsageInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { apiKey?: VerifiedApiKey }>();
    const res = http.getResponse<Response>();

    const apiKey = req.apiKey;
    if (!apiKey) return next.handle();

    // Don't count admin-panel traffic: the dashboard polls the API with the
    // web key + a JWT, which would otherwise swamp the real consumer-app
    // numbers and top-endpoints with /admin/* polling.
    if ((req.path || req.originalUrl || '').includes('/admin/'))
      return next.handle();

    const start = process.hrtime.bigint();
    const ua = (req.headers['user-agent'] as string) ?? '';
    const { platform, os, device } = detectClient(ua);
    const method = req.method;
    const endpoint = normalizeEndpoint(req);
    const appName = apiKey.name.slice(0, 120);
    const apiKeyId = apiKey.id;

    // Capture once the response is fully flushed: statusCode is then accurate
    // for both success and error paths, and latency includes serialization.
    res.once('finish', () => {
      const elapsedMs = Number((process.hrtime.bigint() - start) / 1000n) / 1000;
      void this.prisma.apiRequestLog
        .create({
          data: {
            apiKeyId,
            appName,
            method,
            endpoint: endpoint.slice(0, 255),
            statusCode: res.statusCode || 200,
            // Clamp to a positive int that fits Postgres INTEGER.
            latencyMs: Math.min(Math.max(Math.round(elapsedMs), 0), 2_000_000_000),
            platform,
            os,
            device,
          },
        })
        .catch((err: Error) =>
          // Swallow — analytics must never affect serving. Log at debug only.
          this.logger.debug(`api-usage log failed: ${err.message}`),
        );
    });

    return next.handle();
  }
}

/**
 * Stable route template for grouping (e.g. `/api/v1/quran/surah/:nomor`).
 * Falls back to the raw path with ids masked when no route matched (404s), so
 * a flood of distinct ids can't blow up endpoint cardinality.
 */
function normalizeEndpoint(req: Request): string {
  const route = (req.route as { path?: string } | undefined)?.path;
  if (route) {
    const base = req.baseUrl || '';
    return `${base}${route}` || route || '/';
  }
  const path = (req.path || req.url || '/').split('?')[0];
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '/:id',
    )
    .replace(/\/\d+/g, '/:id');
}

/**
 * Classify the caller into a coarse platform plus OS/device sub-splits.
 * Browser engine tokens win first (an Android Chrome UA is `web`, not the
 * native app); then native SDK fingerprints; then server-side HTTP clients.
 */
function detectClient(ua: string): {
  platform: string;
  os: string | null;
  device: string | null;
} {
  const u = ua.toLowerCase();
  if (!u) return { platform: 'server', os: null, device: null };

  const isBrowser =
    /mozilla|applewebkit|gecko\/|chrome|crios|firefox|fxios|safari|edg\//.test(
      u,
    );
  if (isBrowser) {
    let os = 'other';
    if (/windows/.test(u)) os = 'windows';
    else if (/android/.test(u)) os = 'android';
    else if (/iphone|ipad|ipod/.test(u)) os = 'ios';
    else if (/mac os x|macintosh/.test(u)) os = 'macos';
    else if (/linux/.test(u)) os = 'linux';
    let device = 'desktop';
    if (/ipad|tablet/.test(u)) device = 'tablet';
    else if (/mobi|iphone|ipod|android.*mobile/.test(u)) device = 'mobile';
    return { platform: 'web', os, device };
  }
  // Native mobile SDK fingerprints.
  if (/cfnetwork|darwin/.test(u))
    return { platform: 'ios', os: 'ios', device: 'mobile' };
  if (/okhttp|dart|flutter|ktor|android/.test(u))
    return { platform: 'android', os: 'android', device: 'mobile' };
  // Server-side / scripted HTTP clients (Next.js SSR, curl, bots…).
  if (/node|undici|axios|got|java\/|python|curl|wget|go-http|bot|spider/.test(u))
    return { platform: 'server', os: null, device: null };
  return { platform: 'other', os: null, device: null };
}
