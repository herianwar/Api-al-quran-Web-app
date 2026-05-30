import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { AdminKeyGuard } from './admin-key.guard';

interface JwtUser {
  role?: string;
}

/**
 * Either-or auth: accept the static `x-seed-admin-key` header (for CI /
 * scripts) **or** a valid admin JWT (the in-browser admin panel path). If
 * the seed-key header is present we go strictly down that branch so a bad
 * key doesn't silently fall through to JWT.
 *
 * Lets the admin panel manage api-keys without an extra prompt while still
 * keeping the unattended automation flow that previously relied on the seed
 * key intact.
 */
@Injectable()
export class JwtOrAdminKeyGuard implements CanActivate {
  constructor(
    private readonly adminKey: AdminKeyGuard,
    private readonly jwt: JwtAuthGuard,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();

    if (req.headers['x-seed-admin-key']) {
      // Caller explicitly chose the script-style auth — honour it strictly.
      const r = await Promise.resolve(this.adminKey.canActivate(ctx));
      return r as boolean;
    }

    const ok = await Promise.resolve(this.jwt.canActivate(ctx));
    if (!ok) return false;
    const user = (req as unknown as { user?: JwtUser }).user;
    if (user?.role !== 'admin') {
      throw new ForbiddenException({
        message: 'Akses hanya untuk admin',
        error: 'FORBIDDEN',
      });
    }
    return true;
  }
}

// Re-export for callers that want a single import site.
export { UnauthorizedException };
