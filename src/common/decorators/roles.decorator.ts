import { SetMetadata } from '@nestjs/common';

export const ROLES_METADATA_KEY = 'auth:roles';

/**
 * Restrict a route to users whose `User.role` is in the given list.
 * Used in combination with `JwtAuthGuard` + `RolesGuard` — JWT guard runs
 * first to populate req.user, then RolesGuard checks the role list.
 *
 * Example:
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('admin')
 *   @Get('users')
 *   listUsers() { ... }
 */
export const Roles = (...roles: string[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);
