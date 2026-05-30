import { SetMetadata } from '@nestjs/common';

export const ETAG_METADATA_KEY = 'etag:cacheable';

/**
 * Mark a route handler so the global ETagInterceptor will compute a hash
 * of the response, attach `ETag` + `Cache-Control` headers, and respond
 * with 304 Not Modified when the request's `If-None-Match` matches.
 *
 * Use only on endpoints whose payload is a deterministic function of the
 * current DB state (e.g. Quran content). NEVER use for personalized data.
 *
 * @param maxAgeSeconds — value injected into Cache-Control: public, max-age=...
 */
export const ETagCacheable = (maxAgeSeconds: number = 3600) =>
  SetMetadata(ETAG_METADATA_KEY, { maxAgeSeconds });
