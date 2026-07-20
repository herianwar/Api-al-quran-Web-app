import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { ETAG_METADATA_KEY } from '../decorators/etag.decorator';

interface ETagMeta {
  maxAgeSeconds: number;
  ignoreFields?: string[];
}

/**
 * True when `If-None-Match` covers `etag`. Handles the "*" wildcard, the
 * comma-separated list form, and weak validators (`W/"abc"`) — clients and
 * proxies emit all three, and a naive `===` silently never matches.
 */
function ifNoneMatchHits(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  const normalize = (v: string) => v.trim().replace(/^W\//, '');
  const target = normalize(etag);
  return header.split(',').some((candidate) => normalize(candidate) === target);
}

/**
 * Compute an ETag from the JSON response body and short-circuit with
 * 304 Not Modified when the client already has it cached. Only runs on
 * routes decorated with `@ETagCacheable()` — see decorator docs for why.
 *
 * Order: this interceptor MUST run AFTER TransformInterceptor so the body
 * it hashes is the final wire format. In app.module.ts, register order:
 *   { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
 *   { provide: APP_INTERCEPTOR, useClass: ETagInterceptor },
 * Nest invokes interceptors top-to-bottom on the way in and bottom-to-top
 * on the way out, so ETagInterceptor sees the transformed payload.
 */
@Injectable()
export class ETagInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<ETagMeta | undefined>(
      ETAG_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      map((body: unknown) => {
        // Stable hash of the serialized body. We use SHA-1 (96-bit hex
        // prefix is plenty for cache key uniqueness) and quote it per
        // RFC 7232 "strong validator" syntax.
        //
        // Fields listed in `ignoreFields` are dropped at every depth by the
        // replacer, so volatile counters don't invalidate the cache. The
        // response body itself is untouched — only the hash input is.
        const ignore = new Set(meta.ignoreFields ?? []);
        const json = ignore.size
          ? JSON.stringify(body, (key, value) =>
              ignore.has(key) ? undefined : (value as unknown),
            )
          : JSON.stringify(body);
        const hash = createHash('sha1').update(json).digest('hex').slice(0, 24);
        const etag = `"${hash}"`;

        res.setHeader('ETag', etag);
        res.setHeader(
          'Cache-Control',
          `public, max-age=${meta.maxAgeSeconds}, must-revalidate`,
        );

        if (ifNoneMatchHits(req.headers['if-none-match'], etag)) {
          res.status(304);
          // 304 MUST NOT have a body per RFC 7232.
          return undefined;
        }
        return body;
      }),
    );
  }
}
