import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

/** Kategori masukan — harus persis 4 nilai ini (dikirim app Android). */
export const FEEDBACK_KATEGORI = [
  'fitur_baru',
  'bug',
  'konten',
  'lainnya',
] as const;

/** Status lifecycle sebuah masukan (dikelola admin). */
export const FEEDBACK_STATUS = [
  'baru',
  'ditinjau',
  'dikerjakan',
  'selesai',
  'ditolak',
] as const;

/** Trim string, kembalikan undefined kalau kosong (opsional field). */
const trimOrUndef = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

/** Body untuk POST /feedback (publik — guest atau login). */
export class CreateFeedbackDto {
  @ApiProperty({
    enum: FEEDBACK_KATEGORI,
    example: 'fitur_baru',
    description: 'fitur_baru | bug | konten | lainnya',
  })
  @IsIn(FEEDBACK_KATEGORI as unknown as string[], {
    message: 'Kategori tidak valid',
  })
  kategori!: string;

  @ApiProperty({
    example: 'Mode gelap untuk baca Qur’an malam hari',
    minLength: 4,
    maxLength: 100,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(4, { message: 'Judul minimal 4 karakter' })
  @MaxLength(100, { message: 'Judul maksimal 100 karakter' })
  judul!: string;

  @ApiProperty({
    example: 'Tolong tambahkan dark mode, mata perih kalau baca malam hari…',
    minLength: 20,
    maxLength: 1000,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(20, { message: 'Deskripsi minimal 20 karakter' })
  @MaxLength(1000, { message: 'Deskripsi maksimal 1000 karakter' })
  deskripsi!: string;

  @ApiPropertyOptional({
    example: 'user@email.com',
    description: 'Opsional, untuk balasan manual tim',
  })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsEmail({}, { message: 'Format email tidak valid' })
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: '1.0.0+12' })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional({ example: 'android', description: 'String bebas' })
  @IsOptional()
  @Transform(trimOrUndef)
  @IsString()
  @MaxLength(30)
  platform?: string;
}

/** Query list admin: extends pagination supaya param ekstra lolos whitelist. */
export class FeedbackListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FEEDBACK_STATUS })
  @IsOptional()
  @IsIn(FEEDBACK_STATUS as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ enum: FEEDBACK_KATEGORI })
  @IsOptional()
  @IsIn(FEEDBACK_KATEGORI as unknown as string[])
  kategori?: string;

  @ApiPropertyOptional({ description: 'Cari di judul / deskripsi' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Filter createdAt >= (ISO-8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter createdAt <= (ISO-8601)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'status'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'status'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: string;
}

/** Body PATCH /admin/feedback/:id — partial update (salah satu / keduanya). */
export class UpdateFeedbackDto {
  @ApiPropertyOptional({ enum: FEEDBACK_STATUS })
  @IsOptional()
  @IsIn(FEEDBACK_STATUS as unknown as string[], {
    message: 'Status tidak valid',
  })
  status?: string;

  @ApiPropertyOptional({
    description: 'Catatan internal admin (tidak dikirim ke user)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  catatanAdmin?: string;
}
