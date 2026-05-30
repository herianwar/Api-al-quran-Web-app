import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Standard pagination + delta-sync query params used by list endpoints.
 *
 * - `page` (1-based) & `limit` are decoded with class-transformer's implicit
 *   numeric conversion so query strings work without manual `+x`.
 * - `since` is an ISO-8601 timestamp used by mobile clients to fetch only
 *   rows changed after their last successful sync.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 20;

  @ApiPropertyOptional({
    description:
      'ISO-8601 timestamp. Only rows with updatedAt > since are returned (delta sync).',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  since?: string;
}

/** Convert the validated dto + total count into a meta object for envelopes. */
export function paginationMeta(
  dto: PaginationQueryDto,
  total: number,
): {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
} {
  const totalPages = Math.max(1, Math.ceil(total / dto.limit));
  return {
    total,
    page: dto.page,
    limit: dto.limit,
    totalPages,
    hasMore: dto.page < totalPages,
  };
}

/** Translate a PaginationQueryDto into Prisma `skip` + `take`. */
export function paginationArgs(dto: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  return { skip: (dto.page - 1) * dto.limit, take: dto.limit };
}

/** Build a Prisma `where` fragment for the `?since=` filter. */
export function sinceWhere(
  dto: PaginationQueryDto,
  field: string = 'updatedAt',
): Record<string, unknown> {
  if (!dto.since) return {};
  const d = new Date(dto.since);
  if (isNaN(d.getTime())) return {};
  return { [field]: { gt: d } };
}
