import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Allowed article lifecycle statuses. */
export const ARTIKEL_STATUSES = ['draft', 'scheduled', 'published'] as const;
import { PaginationQueryDto } from '../../../common/dto/pagination';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Public/admin list query for articles. Extends pagination so the global
 *  whitelist accepts the extra filter params (bare @Query would 400). */
export class ArtikelListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cari di judul / ringkasan / tag' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Filter slug kategori' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  kategori?: string;

  @ApiPropertyOptional({ description: 'Filter satu tag' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

  @ApiPropertyOptional({ description: 'Hanya artikel unggulan', type: Boolean })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({
    description: 'Filter status (admin saja): draft | scheduled | published',
    enum: ARTIKEL_STATUSES,
  })
  @IsOptional()
  @IsIn(ARTIKEL_STATUSES as unknown as string[])
  status?: string;
}

export class CreateArtikelDto {
  @ApiProperty({ example: 'keutamaan-membaca-al-quran' })
  @IsString()
  @Matches(SLUG_RE, {
    message: 'slug harus huruf kecil, angka, dan tanda hubung saja',
  })
  @MaxLength(140)
  slug!: string;

  @ApiProperty({ example: 'Keutamaan Membaca Al-Quran' })
  @IsString()
  @MaxLength(220)
  judul!: string;

  @ApiPropertyOptional({ description: 'Ringkasan / excerpt' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ringkasan?: string;

  @ApiProperty({ description: 'Body HTML dari editor' })
  @IsString()
  konten!: string;

  @ApiPropertyOptional({ description: 'URL gambar sampul' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  coverAlt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  penulis?: string;

  @ApiPropertyOptional({ enum: ARTIKEL_STATUSES, default: 'draft' })
  @IsOptional()
  @IsIn(ARTIKEL_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({
    description: 'ISO-8601 waktu terbit otomatis (untuk status "scheduled")',
    example: '2026-06-10T09:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Override SEO title' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'Override meta description' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'URL gambar Open Graph khusus' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogImage?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'ID kategori' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

/** All fields optional for partial update. */
export class UpdateArtikelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_RE, {
    message: 'slug harus huruf kecil, angka, dan tanda hubung saja',
  })
  @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(220)
  judul?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ringkasan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  konten?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  coverAlt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  penulis?: string;

  @ApiPropertyOptional({ enum: ARTIKEL_STATUSES })
  @IsOptional()
  @IsIn(ARTIKEL_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({
    description: 'ISO-8601 waktu terbit otomatis (untuk status "scheduled")',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  metaDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'ID kategori (null untuk lepas)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;
}

/** Body for bulk admin actions on a set of article ids. */
export class BulkArtikelDto {
  @ApiProperty({ type: [Number], example: [1, 2, 3] })
  @IsArray()
  @ArrayMaxSize(200)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];

  @ApiProperty({
    enum: ['publish', 'draft', 'feature', 'unfeature', 'delete'],
    description: 'Aksi yang diterapkan ke semua id',
  })
  @IsIn(['publish', 'draft', 'feature', 'unfeature', 'delete'])
  action!: 'publish' | 'draft' | 'feature' | 'unfeature' | 'delete';
}

export class CreateKategoriDto {
  @ApiProperty({ example: 'kajian' })
  @IsString()
  @Matches(SLUG_RE, {
    message: 'slug harus huruf kecil, angka, dan tanda hubung saja',
  })
  @MaxLength(120)
  slug!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  nama!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deskripsi?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  urutan?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateKategoriDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nama?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deskripsi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  urutan?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
