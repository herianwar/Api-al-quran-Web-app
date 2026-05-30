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
        const json = JSON.stringify(body);
        const hash = createHash('sha1').update(json).digest('hex').slice(0, 24);
        const etag = `"${hash}"`;

        res.setHeader('ETag', etag);
        res.setHeader(
          'Cache-Control',
          `public, max-age=${meta.maxAgeSeconds}, must-revalidate`,
        );

        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
          res.status(304);
          // 304 MUST NOT have a body per RFC 7232.
          return undefined;
        }
        return body;
      }),
    );
  }
}
