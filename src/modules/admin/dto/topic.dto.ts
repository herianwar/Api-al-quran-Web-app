import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const slugify = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/**
 * Body for POST/PUT `/admin/content/topic`. Replaces the bare `TopicInput`
 * interface (which the global ValidationPipe could not validate). Enforces a
 * URL-safe slug and required fields.
 */
export class TopicDto {
  @ApiProperty({ example: 'sabar', description: 'huruf kecil, angka, dash' })
  @Transform(slugify)
  @IsString()
  @MinLength(1, { message: 'Slug wajib diisi' })
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug hanya boleh huruf kecil, angka, dan tanda minus',
  })
  slug: string;

  @ApiProperty({ example: 'Sabar' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Nama wajib diisi' })
  @MaxLength(120)
  nama: string;

  @ApiPropertyOptional({ example: 100, default: 100, description: 'kecil = atas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  urutan?: number;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deskripsi?: string | null;
}

/**
 * Body for POST `/admin/content/topic/:id/ayat`. Replaces the bare
 * `TopicAyatInput` interface.
 */
export class TopicAyatDto {
  @ApiProperty({ example: 2, minimum: 1, maximum: 114 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  surahNomor: number;

  @ApiProperty({ example: 153, minimum: 1, maximum: 286 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(286)
  nomorAyat: number;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  catatan?: string | null;
}
