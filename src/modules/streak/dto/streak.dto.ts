import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class LogSessionDto {
  @ApiPropertyOptional({
    description:
      'Tanggal lokal user (YYYY-MM-DD). Kalau kosong, server pakai UTC today — disarankan client kirim tanggal lokal.',
    example: '2026-05-28',
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'tanggal harus YYYY-MM-DD' })
  tanggal?: string;

  @ApiPropertyOptional({
    description: 'Jumlah ayat yang dibaca (default 1). Akan di-increment.',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  ayatCount?: number;
}

export class UpdateGoalDto {
  @ApiProperty({ enum: ['ayat', 'halaman', 'juz'], example: 'ayat' })
  @IsString()
  @IsIn(['ayat', 'halaman', 'juz'])
  unit: string;

  @ApiProperty({ minimum: 1, maximum: 30, example: 10 })
  @IsInt()
  @Min(1)
  @Max(30)
  target: number;
}

export class UpsertKhatamDto {
  @ApiProperty({ description: 'Tanggal mulai (YYYY-MM-DD)', example: '2026-06-01' })
  @IsString()
  @Matches(ISO_DATE, { message: 'mulai harus YYYY-MM-DD' })
  mulai: string;

  @ApiProperty({
    description: 'Target tanggal khatam (YYYY-MM-DD)',
    example: '2026-07-01',
  })
  @IsString()
  @Matches(ISO_DATE, { message: 'targetTanggal harus YYYY-MM-DD' })
  targetTanggal: string;
}
