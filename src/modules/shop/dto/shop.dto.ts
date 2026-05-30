import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Machine key for a form field: lowercase, must start with a letter. */
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Supported dynamic form field input types. */
export const ORDER_FIELD_TYPES = [
  'text',
  'textarea',
  'tel',
  'email',
  'number',
  'select',
] as const;

/** Order workflow statuses (in lifecycle order). */
export const ORDER_STATUSES = [
  'baru',
  'diproses',
  'dikirim',
  'selesai',
  'batal',
] as const;

export class ProductListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Substring search di nama/deskripsi' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({
    description:
      'Hanya tampilkan unggulan (isFeatured=true). Default false (semua).',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'mukena' })
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'slug harus lowercase, angka, dan dash saja',
  })
  @MaxLength(60)
  slug!: string;

  @ApiProperty({ example: 'Mukena' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nama!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deskripsi?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(60)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
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
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ example: 'mukena-katun-premium' })
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(120)
  slug!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nama!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  deskripsi!: string;

  @ApiProperty({ example: 125000, description: 'Harga dalam rupiah (integer)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hargaIdr!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hargaCoret?: number;

  @ApiPropertyOptional({ description: 'Null = stok tersedia tanpa angka' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stok?: number;

  @ApiPropertyOptional({
    description: 'Nomor WA override format 62812xxx (digits only)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^62\d{8,14}$/, {
    message: 'waNumber harus format 62812xxxxxxx (digits only)',
  })
  waNumber?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId!: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nama?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  deskripsi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hargaIdr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hargaCoret?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stok?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^62\d{8,14}$/)
  waNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

export class UpdateImageOrderDto {
  @ApiProperty({
    description: 'Array of image IDs in desired display order',
    example: [12, 8, 5],
  })
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  imageIds!: number[];
}

// ─── Banners (promosi toko) ───────────────────────────────────────────

export class CreateBannerDto {
  @ApiPropertyOptional({ example: 'Promo Ramadhan' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: 'Diskon mukena & sajadah s.d. 30%' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @ApiPropertyOptional({
    description:
      'URL gambar absolut (opsional — biasanya di-set via upload .../image)',
    example: 'https://cdn.example.com/banner.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Target saat banner di-tap: path internal "/toko/slug" atau URL penuh',
    example: '/toko/mukena-katun-premium',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBannerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderBannersDto {
  @ApiProperty({
    description: 'Array of banner IDs in desired display order',
    example: [3, 1, 2],
  })
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  bannerIds!: number[];
}

export class UpdateSettingDto {
  @ApiProperty({ example: '628123456789' })
  @IsString()
  @MaxLength(2000)
  value!: string;
}

// ─── Order form builder (dynamic fields) ──────────────────────────────

export class CreateOrderFieldDto {
  @ApiProperty({
    example: 'nama',
    description: 'Machine key (lowercase, mulai huruf, boleh underscore)',
  })
  @IsString()
  @Matches(FIELD_KEY_PATTERN, {
    message: 'key harus lowercase, mulai huruf, hanya huruf/angka/underscore',
  })
  @MaxLength(40)
  key!: string;

  @ApiProperty({ example: 'Nama Lengkap' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @ApiPropertyOptional({ enum: ORDER_FIELD_TYPES, default: 'text' })
  @IsOptional()
  @IsIn(ORDER_FIELD_TYPES)
  type?: (typeof ORDER_FIELD_TYPES)[number];

  @ApiPropertyOptional({ example: 'mis. Jl. Merdeka No. 1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpText?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Pilihan untuk type=select',
    example: ['Merah', 'Biru', 'Hijau'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateOrderFieldDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(FIELD_KEY_PATTERN)
  @MaxLength(40)
  key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({ enum: ORDER_FIELD_TYPES })
  @IsOptional()
  @IsIn(ORDER_FIELD_TYPES)
  type?: (typeof ORDER_FIELD_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderFieldsDto {
  @ApiProperty({
    description: 'Array of field IDs in desired display order',
    example: [3, 1, 2],
  })
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  fieldIds!: number[];
}

// ─── Orders ───────────────────────────────────────────────────────────

export class CreateOrderDto {
  @ApiPropertyOptional({
    description: 'Slug produk yang dipesan (opsional — order bisa tanpa produk)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  productSlug?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 999 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @ApiProperty({
    description: 'Nilai field dinamis, keyed by field key',
    example: { nama: 'Budi', alamat: 'Jl. Merdeka 1', no_hp: '08123456789' },
  })
  @IsObject()
  fields!: Record<string, unknown>;
}

export class OrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Cari di orderNumber / nama / no HP' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by product id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsIn(ORDER_STATUSES)
  status!: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Catatan internal admin' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}
