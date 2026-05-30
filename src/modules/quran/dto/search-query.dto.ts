import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiPropertyOptional({ description: 'Kata kunci pencarian', example: 'sabar' })
  @IsString()
  @MinLength(2, { message: 'Kata kunci minimal 2 karakter' })
  q: string;

  @ApiPropertyOptional({
    description: 'Bahasa pencarian',
    enum: ['id', 'latin', 'arab'],
    default: 'id',
  })
  @IsOptional()
  @IsIn(['id', 'latin', 'arab'])
  lang: 'id' | 'latin' | 'arab' = 'id';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
