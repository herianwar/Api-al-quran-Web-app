import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Protects admin/seed endpoints with a static key passed via the
 * `x-seed-admin-key` header. Query-param fallback was removed because
 * URLs leak through proxy logs, browser history and Referer headers.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers['x-seed-admin-key'];
    const expected = this.config.get<string>('seedAdminKey');

    if (
      typeof provided !== 'string' ||
      !expected ||
      !this.safeEqual(provided, expected)
    ) {
      throw new UnauthorizedException({
        message: 'Admin key tidak valid',
        error: 'UNAUTHORIZED',
      });
    }
    return true;
  }

  /** Constant-time string compare so failures don't leak timing info. */
  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }
}
