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
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateHaidPeriodDto {
  @ApiProperty({ enum: ['haid', 'nifas', 'istihadhah'], default: 'haid' })
  @IsOptional()
  @IsIn(['haid', 'nifas', 'istihadhah'])
  jenis?: 'haid' | 'nifas' | 'istihadhah';

  @ApiProperty({ description: 'Tanggal mulai (YYYY-MM-DD)', example: '2026-05-20' })
  @Matches(ISO_DATE, { message: 'mulai harus format YYYY-MM-DD' })
  mulai!: string;

  @ApiPropertyOptional({
    description: 'Tanggal selesai (YYYY-MM-DD). Kosongkan bila masih berlangsung.',
    example: '2026-05-26',
  })
  @IsOptional() // null/"" = periode masih berlangsung
  @ValidateIf((_o, value) => value !== '')
  @Matches(ISO_DATE, { message: 'selesai harus format YYYY-MM-DD' })
  selesai?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  catatan?: string;
}

export class UpdateHaidPeriodDto {
  @ApiPropertyOptional({ enum: ['haid', 'nifas', 'istihadhah'] })
  @IsOptional()
  @IsIn(['haid', 'nifas', 'istihadhah'])
  jenis?: 'haid' | 'nifas' | 'istihadhah';

  @ApiPropertyOptional({ example: '2026-05-20' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'mulai harus format YYYY-MM-DD' })
  mulai?: string;

  @ApiPropertyOptional({
    description: 'Set null/"" untuk menandai masih berlangsung.',
    example: '2026-05-26',
  })
  @IsOptional() // null = tandai masih berlangsung
  @ValidateIf((_o, value) => value !== '') // "" idem (form kosong dari app)
  @Matches(ISO_DATE, { message: 'selesai harus format YYYY-MM-DD' })
  selesai?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  catatan?: string;
}

export class StatusQueryDto {
  @ApiPropertyOptional({
    description: 'Tanggal yang ingin dicek (YYYY-MM-DD). Default hari ini.',
    example: '2026-05-22',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'date harus format YYYY-MM-DD' })
  date?: string;
}

export class PuasaSunnahQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 120,
    default: 45,
    description: 'Jumlah hari ke depan yang dihitung.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  hari: number = 45;
}

export class CreateQadhaDto {
  @ApiProperty({ enum: ['haid', 'nifas', 'safar', 'sakit', 'lainnya'], default: 'haid' })
  @IsOptional()
  @IsIn(['haid', 'nifas', 'safar', 'sakit', 'lainnya'])
  sumber?: string;

  @ApiProperty({ minimum: 1, maximum: 366, description: 'Jumlah hari hutang' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  jumlah!: number;

  @ApiPropertyOptional({ description: 'Hari yang sudah dibayar' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(366)
  lunas?: number;

  @ApiPropertyOptional({ description: 'Tahun Hijriah Ramadhan asal hutang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1600)
  tahun?: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  catatan?: string;
}

export class UpdateQadhaDto {
  @ApiPropertyOptional({ enum: ['haid', 'nifas', 'safar', 'sakit', 'lainnya'] })
  @IsOptional()
  @IsIn(['haid', 'nifas', 'safar', 'sakit', 'lainnya'])
  sumber?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 366 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  jumlah?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 366 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(366)
  lunas?: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  catatan?: string;
}

export class BayarQadhaDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 366, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  jumlah: number = 1;
}

const ISO_DATE_OPT = /^\d{4}-\d{2}-\d{2}$/;

export class AmalanQueryDto {
  @ApiPropertyOptional({ description: 'Tanggal (YYYY-MM-DD). Default hari ini.' })
  @IsOptional()
  @Matches(ISO_DATE_OPT, { message: 'tanggal harus format YYYY-MM-DD' })
  tanggal?: string;
}

// ─── Mood & gejala harian ──────────────────────────────────────────────
//
// DTO hanya menjaga BENTUK (tipe, panjang, struktur). Keanggotaan enum
// (mood/flow/intensitas/key gejala) sengaja divalidasi di service supaya bisa
// mengembalikan 422 + `code` domain yang bisa dibaca app, bukan 400 generik
// dari ValidationPipe global.

export class SymptomDto {
  @ApiProperty({ description: 'Key gejala, mis. "kram"', example: 'kram' })
  @IsString()
  @MaxLength(40)
  key!: string;

  @ApiPropertyOptional({
    enum: ['ringan', 'sedang', 'berat'],
    description: 'Opsional; null = tidak diisi.',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  intensitas?: string | null;
}

export class UpsertMoodDto {
  @ApiPropertyOptional({
    enum: ['joyful', 'calm', 'neutral', 'tired', 'sad', 'anxious', 'angry'],
    description: 'Kirim null untuk mengosongkan.',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  mood?: string | null;

  @ApiPropertyOptional({
    enum: ['spotting', 'ringan', 'sedang', 'deras'],
    description: 'Intensitas aliran haid hari itu. Kirim null untuk mengosongkan.',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  flow?: string | null;

  @ApiPropertyOptional({
    type: [SymptomDto],
    description: 'Daftar gejala. Kirim [] atau null untuk mengosongkan.',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SymptomDto)
  symptoms?: SymptomDto[] | null;

  @ApiPropertyOptional({ maxLength: 500, description: 'Kirim null untuk mengosongkan.' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** Satu entri pada import massal — sama seperti upsert + tanggalnya. */
export class BulkMoodItemDto extends UpsertMoodDto {
  @ApiProperty({ description: 'Tanggal (YYYY-MM-DD)', example: '2026-07-20' })
  @Matches(ISO_DATE, { message: 'tanggal harus format YYYY-MM-DD' })
  tanggal!: string;
}

export class BulkMoodDto {
  @ApiProperty({
    type: [BulkMoodItemDto],
    description: 'Maksimal 400 entri per request (≈13 bulan catatan harian).',
  })
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => BulkMoodItemDto)
  entries!: BulkMoodItemDto[];
}

export class MoodRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Awal rentang (YYYY-MM-DD). Default 60 hari sebelum `to`.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from harus format YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Akhir rentang (YYYY-MM-DD). Default hari ini (WIB).',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'to harus format YYYY-MM-DD' })
  to?: string;
}

export class ToggleAmalanDto {
  @ApiProperty({ description: 'Key amalan, mis. "subuh" / "tilawah"' })
  @IsString()
  key!: string;

  @ApiProperty({ description: 'true = tandai selesai, false = batalkan' })
  @IsBoolean()
  done!: boolean;

  @ApiPropertyOptional({ description: 'Tanggal (YYYY-MM-DD). Default hari ini.' })
  @IsOptional()
  @Matches(ISO_DATE_OPT, { message: 'tanggal harus format YYYY-MM-DD' })
  tanggal?: string;
}
