import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** Query params for GET /adzan. Declared as a DTO (not bare @Query) so the
 *  global whitelist/forbidNonWhitelisted validation accepts `jenis`. */
export class AdzanQueryDto {
  @ApiPropertyOptional({
    description: 'Filter berdasarkan jenis adzan',
    enum: ['umum', 'subuh'],
    example: 'umum',
  })
  @IsOptional()
  @IsIn(['umum', 'subuh'])
  jenis?: string;
}
