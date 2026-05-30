import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

export class HadithListQueryDto extends PaginationQueryDto {
  /**
   * Substring search across `arab` and `terjemahan`. Case-insensitive.
   * Allowed on per-perawi list AND the cross-perawi search endpoint.
   */
  @ApiPropertyOptional({
    description: 'Cari di teks arab/terjemahan (case-insensitive)',
    example: 'sabar',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q?: string;
}

export class HadithSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Kata kunci pencarian (case-insensitive)',
    example: 'shalat',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q!: string;

  @ApiPropertyOptional({
    description: 'Filter ke 1 perawi (slug)',
    example: 'bukhari',
  })
  @IsOptional()
  @IsString()
  perawi?: string;
}
