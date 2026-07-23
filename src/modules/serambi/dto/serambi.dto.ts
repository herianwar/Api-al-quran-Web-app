import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

/** Status sebuah post Serambi. */
export const SERAMBI_POST_STATUS = [
  'draft',
  'scheduled',
  'published',
  'archived',
] as const;

/** Nilai `?sort=` yang diterima daftar post admin. */
export const SERAMBI_POST_SORTS = [
  'terbaru', // createdAt desc (default)
  'terlama', // createdAt asc
  'diperbarui', // updatedAt desc
  'disukai', // likeCount desc
  'dikomentari', // commentCount desc
] as const;

/** Aksi massal yang bisa diterapkan ke sekumpulan post. */
export const SERAMBI_BULK_ACTIONS = [
  'publish',
  'draft',
  'archive',
  'author',
  'delete',
] as const;

/** Status moderasi sebuah komentar. */
export const SERAMBI_COMMENT_STATUS = ['visible', 'hidden'] as const;

/** Trim string; kembalikan undefined kalau kosong (untuk field opsional). */
const trimOrUndef = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

/** Trim string; pertahankan '' (dipakai admin untuk mengosongkan field). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// ─── Publik ────────────────────────────────────────────────────────────

/** Body POST /serambi/posts/:id/comments (Bearer wajib). */
export class CreateCommentDto {
  @ApiProperty({ example: 'Masya Allah 🌿', minLength: 1, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Komentar tidak boleh kosong' })
  @MaxLength(500, { message: 'Komentar maksimal 500 karakter' })
  body!: string;
}

// ─── Admin: post ───────────────────────────────────────────────────────

/** Body POST /admin/serambi/posts. */
export class CreateSerambiPostDto {
  @ApiProperty({
    example: 'Sabar itu bukan diam, tapi terus melangkah dalam ketaatan.',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Isi post tidak boleh kosong' })
  @MaxLength(2000, { message: 'Isi post maksimal 2000 karakter' })
  body!: string;

  @ApiPropertyOptional({
    example: '/uploads/serambi/xxx.jpg',
    description: 'URL gambar (relatif /uploads/... atau absolut)',
  })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ example: "Rumah Qur'an", default: "Rumah Qur'an" })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  @MaxLength(80)
  authorName?: string;

  @ApiPropertyOptional({ example: '/uploads/serambi/logo.png' })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  @MaxLength(500)
  authorAvatarUrl?: string;

  @ApiPropertyOptional({
    description:
      'ID master penulis. Bila diisi, authorName & authorAvatarUrl diambil otomatis dari master (menimpa nilai manual di atas).',
  })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({ enum: SERAMBI_POST_STATUS, default: 'published' })
  @IsOptional()
  @IsIn(SERAMBI_POST_STATUS as unknown as string[], {
    message: 'Status tidak valid',
  })
  status?: string;

  @ApiPropertyOptional({
    description:
      'Waktu tayang (ISO 8601) untuk status "scheduled". Bila kosong/lampau, langsung tayang.',
    example: '2026-07-20T08:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Waktu tayang tidak valid' })
  scheduledAt?: string;
}

/** Body PATCH /admin/serambi/posts/:id — semua field opsional. */
export class UpdateSerambiPostDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Isi post tidak boleh kosong' })
  @MaxLength(2000, { message: 'Isi post maksimal 2000 karakter' })
  body?: string;

  @ApiPropertyOptional({ description: "Kirim '' untuk menghapus gambar" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  authorName?: string;

  @ApiPropertyOptional({ description: "Kirim '' untuk menghapus avatar" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  authorAvatarUrl?: string;

  @ApiPropertyOptional({
    description:
      "ID master penulis. Bila diisi, authorName & authorAvatarUrl disalin dari master. Kirim '' untuk melepas referensi penulis.",
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({ enum: SERAMBI_POST_STATUS })
  @IsOptional()
  @IsIn(SERAMBI_POST_STATUS as unknown as string[], {
    message: 'Status tidak valid',
  })
  status?: string;

  @ApiPropertyOptional({
    description:
      'Waktu tayang (ISO 8601) untuk status "scheduled". Bila kosong/lampau, langsung tayang.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Waktu tayang tidak valid' })
  scheduledAt?: string;
}

/** Query GET /admin/serambi/posts. */
export class AdminPostListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SERAMBI_POST_STATUS })
  @IsOptional()
  @IsIn(SERAMBI_POST_STATUS as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ description: 'Cari di isi post / nama penulis' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    description:
      'Filter per master penulis. Nilai "none" = post tanpa master penulis (nama ditulis manual).',
  })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({
    description: 'Urutan hasil. Default: "terbaru".',
    enum: SERAMBI_POST_SORTS,
  })
  @IsOptional()
  @IsIn(SERAMBI_POST_SORTS as unknown as string[])
  sort?: string;
}

/** Body POST /admin/serambi/posts/bulk. */
export class BulkSerambiPostDto {
  @ApiProperty({ type: [String], description: 'ID post yang dipilih' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Tidak ada post dipilih' })
  @ArrayMaxSize(200, { message: 'Maksimal 200 post per aksi massal' })
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({
    enum: SERAMBI_BULK_ACTIONS,
    description:
      'Aksi untuk semua id. "author" memindahkan post ke master penulis `authorId`. Aksi massal "publish" tidak mengirim push notification (anti-spam).',
  })
  @IsIn(SERAMBI_BULK_ACTIONS as unknown as string[], {
    message: 'Aksi massal tidak valid',
  })
  action!: (typeof SERAMBI_BULK_ACTIONS)[number];

  @ApiPropertyOptional({
    description: 'Master penulis tujuan untuk action "author".',
  })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  authorId?: string;
}

// ─── Admin: komentar ───────────────────────────────────────────────────

/** Body PATCH /admin/serambi/comments/:id. */
export class UpdateCommentStatusDto {
  @ApiProperty({ enum: SERAMBI_COMMENT_STATUS })
  @IsIn(SERAMBI_COMMENT_STATUS as unknown as string[], {
    message: 'Status komentar tidak valid',
  })
  status!: string;
}

/** Query GET /admin/serambi/comments. */
export class AdminCommentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter komentar milik satu post' })
  @IsOptional()
  @IsString()
  postId?: string;

  @ApiPropertyOptional({ enum: SERAMBI_COMMENT_STATUS })
  @IsOptional()
  @IsIn(SERAMBI_COMMENT_STATUS as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ description: 'Cari di isi komentar' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

// ─── Admin: master penulis ─────────────────────────────────────────────

/** Body POST /admin/serambi/authors. */
export class CreateSerambiAuthorDto {
  @ApiProperty({ example: 'Ustadz Ahmad', minLength: 1, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Nama penulis tidak boleh kosong' })
  @MaxLength(80, { message: 'Nama penulis maksimal 80 karakter' })
  name!: string;

  @ApiPropertyOptional({ example: '/uploads/serambi/avatar.webp' })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}

/** Body PATCH /admin/serambi/authors/:id — semua field opsional. */
export class UpdateSerambiAuthorDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Nama penulis tidak boleh kosong' })
  @MaxLength(80, { message: 'Nama penulis maksimal 80 karakter' })
  name?: string;

  @ApiPropertyOptional({ description: "Kirim '' untuk menghapus avatar" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'Nonaktifkan tanpa menghapus' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Query GET /admin/serambi/authors. */
export class AdminAuthorListQueryDto {
  @ApiPropertyOptional({ description: 'Cari nama penulis' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({
    description: 'Hanya penulis aktif (default: semua)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : undefined,
  )
  @IsBoolean()
  activeOnly?: boolean;
}
