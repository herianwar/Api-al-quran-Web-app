import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator';

interface AuthedRequest extends Request {
  user?: { userId: string; email: string; role: string };
}

/**
 * Authorize requests based on `req.user.role`. The `JwtAuthGuard` must
 * already have run and populated `req.user` (passport puts the JWT payload
 * there). If no `@Roles(...)` decorator is present, this guard is a no-op.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    // Admin-key auth (used by CI/scripts/dual JwtOrAdminKeyGuard) doesn't
    // attach a JWT user, but the key itself proves admin authority. Treat
    // it as satisfying any role check so static-key callers can still hit
    // admin-scoped endpoints (uploads, content CRUD, etc.) the same way
    // browser-auth admins do.
    if (req.headers['x-seed-admin-key']) {
      return true;
    }
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException({
        message: `Akses ditolak. Butuh role: ${required.join(', ')}`,
        error: 'FORBIDDEN',
      });
    }
    return true;
  }
}
