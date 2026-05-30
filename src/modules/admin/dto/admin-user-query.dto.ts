import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

/** Allowed sort modes for the admin user list. */
export const USER_SORTS = ['newest', 'oldest', 'email'] as const;
export type UserSort = (typeof USER_SORTS)[number];

/** Allowed role filters (subset of VALID_ROLES, used for filtering only). */
export const USER_ROLE_FILTERS = ['user', 'admin'] as const;

/**
 * Query params for `GET /admin/users`. Extends the shared pagination DTO so the
 * `q` / `role` / `sort` params are whitelisted — otherwise the global
 * `forbidNonWhitelisted` ValidationPipe rejects them with a 400.
 */
export class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cari berdasarkan email atau nama' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: USER_ROLE_FILTERS, description: 'Filter role' })
  @IsOptional()
  @IsIn(USER_ROLE_FILTERS)
  role?: 'user' | 'admin';

  @ApiPropertyOptional({
    enum: USER_SORTS,
    default: 'newest',
    description: 'Urutan: terbaru, terlama, atau email A-Z',
  })
  @IsOptional()
  @IsIn(USER_SORTS)
  sort: UserSort = 'newest';
}
