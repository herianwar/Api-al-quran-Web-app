import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};

/**
 * Body for POST `/admin/cron/broadcast`. Replaces the inline `{ title?, body? }`
 * object + manual check so the title/body limits are enforced server-side too.
 */
export class BroadcastDto {
  @ApiProperty({ example: 'Ayat Hari Ini', maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Judul wajib diisi' })
  @MaxLength(80)
  title: string;

  @ApiProperty({ example: 'Baca renungan hari ini di app.', maxLength: 240 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Isi wajib diisi' })
  @MaxLength(240)
  body: string;

  @ApiPropertyOptional({ example: '/surat/2', description: 'path deeplink in-app' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  deeplink?: string;

  @ApiPropertyOptional({
    example: 'https://rumahquran.id/uploads/artikel/cover.jpg',
    description: 'Absolute image URL — big-picture (Android) / attachment (iOS)',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}
