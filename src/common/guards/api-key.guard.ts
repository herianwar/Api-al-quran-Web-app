import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { SKIP_API_KEY } from '../decorators/skip-api-key.decorator';
import { ApiKeyService } from '../../modules/api-key/api-key.service';

type VerifiedKey = Awaited<ReturnType<ApiKeyService['verify']>>;

/**
 * Global gate requiring a valid API key on every API route.
 *
 * A caller proves identity via ONE of:
 *  - `x-api-key` header        → native apps (Android/iOS) & server-side fetch
 *  - `api_key` cookie          → browsers (auto-sent on <img>/<audio>/fetch,
 *                                where custom headers are impossible)
 *  - `x-seed-admin-key` header → admin/CI escape hatch (also bypasses the gate)
 *
 * Routes flagged with @SkipApiKey() (e.g. health) are always allowed.
 *
 * bcrypt verification is expensive, so verified raw keys are cached briefly
 * in-memory — the set of live keys is tiny, so this keeps the hot path O(1).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly cache = new Map<string, { value: VerifiedKey; exp: number }>();
  private readonly POSITIVE_TTL = 5 * 60 * 1000; // 5 min
  private readonly NEGATIVE_TTL = 30 * 1000; // 30 s (blunts brute-force)

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeyService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();

    // CORS preflight carries no credentials and must not be blocked.
    if (req.method === 'OPTIONS') return true;

    // Admin/CI escape hatch: a valid seed key bypasses the API-key gate.
    const seed = req.headers['x-seed-admin-key'];
    const expectedSeed = this.config.get<string>('seedAdminKey');
    if (
      typeof seed === 'string' &&
      expectedSeed &&
      this.safeEqual(seed, expectedSeed)
    ) {
      return true;
    }

    const raw = this.extractKey(req);
    if (!raw) {
      throw new UnauthorizedException({
        message:
          'API key wajib. Kirim header "x-api-key" (atau cookie api_key untuk browser).',
        error: 'API_KEY_REQUIRED',
      });
    }

    const verified = await this.verifyCached(raw);
    if (!verified) {
      throw new UnauthorizedException({
        message: 'API key tidak valid, nonaktif, atau kedaluwarsa.',
        error: 'API_KEY_INVALID',
      });
    }

    // Expose to downstream (analytics/rate-limit per key, future use).
    (req as Request & { apiKey?: VerifiedKey }).apiKey = verified;
    return true;
  }

  /** Pull the raw key from header first, then cookie. */
  private extractKey(req: Request): string | null {
    const header = req.headers['x-api-key'];
    if (typeof header === 'string' && header.length > 0) return header;
    const cookie = req.headers.cookie;
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)api_key=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  }

  private async verifyCached(raw: string): Promise<VerifiedKey> {
    const now = Date.now();
    const hit = this.cache.get(raw);
    if (hit && hit.exp > now) return hit.value;
    const value = await this.apiKeys.verify(raw);
    this.cache.set(raw, {
      value,
      exp: now + (value ? this.POSITIVE_TTL : this.NEGATIVE_TTL),
    });
    // Hard cap so a flood of bogus keys can't grow the map unbounded.
    if (this.cache.size > 2000) this.cache.clear();
    return value;
  }

  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }
}
