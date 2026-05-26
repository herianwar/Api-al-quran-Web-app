import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Protects admin/seed endpoints with a static key passed via the
 * `x-seed-admin-key` header (or `?adminKey=` query param).
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided =
      (req.headers['x-seed-admin-key'] as string | undefined) ??
      (req.query.adminKey as string | undefined);
    const expected = this.config.get<string>('seedAdminKey');

    if (!provided || provided !== expected) {
      throw new UnauthorizedException({
        message: 'Admin key tidak valid',
        error: 'UNAUTHORIZED',
      });
    }
    return true;
  }
}
