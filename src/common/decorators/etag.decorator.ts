import { SetMetadata } from '@nestjs/common';

export const ETAG_METADATA_KEY = 'etag:cacheable';

export interface ETagOptions {
  /**
   * Field names removed (at any depth) from the body before hashing it.
   *
   * Use for values that drift independently of the content the client cares
   * about — the article `views` counter is the motivating case: it ticks on
   * every read, so leaving it in the hash would change the ETag constantly
   * and the cache would never hit. The field is still sent in the response;
   * it just doesn't participate in cache validation, so a client may hold a
   * value up to `maxAgeSeconds` stale. That's the intended trade.
   */
  ignoreFields?: string[];
}

/**
 * Mark a route handler so the global ETagInterceptor will compute a hash
 * of the response, attach `ETag` + `Cache-Control` headers, and respond
 * with 304 Not Modified when the request's `If-None-Match` matches.
 *
 * Use only on endpoints whose payload is a deterministic function of the
 * current DB state (e.g. Quran content). NEVER use for personalized data.
 *
 * @param maxAgeSeconds — value injected into Cache-Control: public, max-age=...
 * @param options — see {@link ETagOptions}
 */
export const ETagCacheable = (
  maxAgeSeconds: number = 3600,
  options: ETagOptions = {},
) =>
  SetMetadata(ETAG_METADATA_KEY, {
    maxAgeSeconds,
    ignoreFields: options.ignoreFields ?? [],
  });
