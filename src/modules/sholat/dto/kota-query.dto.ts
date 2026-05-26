import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class KotaQueryDto {
  @ApiProperty({ description: 'Nama provinsi', example: 'Jawa Barat' })
  @IsString()
  provinsi: string;
}

export class JadwalQueryDto {
  @ApiPropertyOptional({ description: 'Bulan (1-12)', example: 5 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(12)
  bulan?: number;

  @ApiPropertyOptional({ description: 'Tahun', example: 2026 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(2000)
  @Max(2100)
  tahun?: number;
}
