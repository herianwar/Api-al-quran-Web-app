import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Create / update a per-route SEO override. `path` is the upsert key. */
export class UpsertSeoPageDto {
  @ApiProperty({ example: '/doa', description: 'Pathname (must start with /).' })
  @IsString()
  @Matches(/^\/[^\s?#]*$/, { message: 'path harus diawali "/" tanpa query/spasi' })
  @MaxLength(512)
  path: string;

  @ApiPropertyOptional({ example: 'Doa & Dzikir' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  keywords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  ogImage?: string;

  @ApiPropertyOptional({ example: 'article' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ogType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  canonical?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @ApiPropertyOptional({ example: 'weekly' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  changefreq?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 0.8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  priority?: number;

  @ApiPropertyOptional({ description: 'Raw JSON-LD (object or array).' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  jsonLd?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
