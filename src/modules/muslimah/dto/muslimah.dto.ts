import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
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
  @IsOptional()
  @Matches(ISO_DATE, { message: 'selesai harus format YYYY-MM-DD' })
  selesai?: string;

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
  @IsOptional()
  @Matches(ISO_DATE, { message: 'selesai harus format YYYY-MM-DD' })
  selesai?: string;

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
