import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

/**
 * Query params for `GET /admin/content/doa`. Extends the shared pagination DTO
 * so `q` is whitelisted — otherwise the global `forbidNonWhitelisted`
 * ValidationPipe rejects `?q=` with a 400.
 */
export class AdminDoaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cari berdasarkan judul atau terjemah' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
