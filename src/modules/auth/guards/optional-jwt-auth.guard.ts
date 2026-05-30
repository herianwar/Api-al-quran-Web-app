import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Variant of JwtAuthGuard that NEVER blocks the request. If a Bearer token
 * is present and valid, `req.user` is populated. Otherwise the request
 * proceeds as anonymous (`req.user` undefined). Used by the analytics
 * tracker so we can attribute page views to logged-in users when possible
 * without requiring login.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser>(_err: unknown, user: TUser | false): TUser {
    // Returning the user (possibly `false`/`null`) without throwing — that
    // tells passport to attach whatever exists but never short-circuit.
    return (user || undefined) as TUser;
  }

  override canActivate(context: ExecutionContext) {
    // Defer to passport but swallow rejections — see handleRequest above.
    return super.canActivate(context);
  }
}
