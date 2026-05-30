import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

export class TopicAyatQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['all', 'curated', 'ai'],
    default: 'all',
    description: 'Filter berdasar sumber: curated (manual), ai (auto-discovered), atau all',
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'curated', 'ai'])
  source?: 'all' | 'curated' | 'ai';
}

export class TopicAskDto {
  @ApiProperty({ example: 'sabar saat anak sakit' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  q: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
