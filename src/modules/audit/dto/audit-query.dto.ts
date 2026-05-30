import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

/**
 * Query params for `GET /admin/audit`. Extends the shared pagination DTO so
 * the `action` prefix filter is whitelisted — otherwise the global
 * `forbidNonWhitelisted` ValidationPipe rejects `?action=` with a 400.
 */
export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter berdasarkan prefix action' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({
    description:
      'Cari di actorEmail atau target (contains, case-insensitive)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
