import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
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
    description: 'Filter status (admin saja): draft | published',
    enum: ['draft', 'published'],
  })
  @IsOptional()
  @IsIn(['draft', 'published'])
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

  @ApiPropertyOptional({ enum: ['draft', 'published'], default: 'draft' })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

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

  @ApiPropertyOptional({ enum: ['draft', 'published'] })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

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
