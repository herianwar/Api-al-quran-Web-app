import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

export class AdminKhutbahQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cari judul / tema' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'Filter tema' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tema?: string;
}

export class KhutbahDto {
  @ApiProperty({ example: 'takwa-bekal-terbaik' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug hanya huruf kecil, angka, dan tanda hubung',
  })
  slug: string;

  @ApiProperty({ example: 'Takwa: Bekal Terbaik' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  judul: string;

  @ApiPropertyOptional({ example: 'akhlak', nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tema?: string | null;

  @ApiPropertyOptional({
    example: '2026-05-15',
    description: 'Tanggal khutbah (opsional, format ISO date)',
    nullable: true,
  })
  @Type(() => Date)
  @IsOptional()
  @IsDate()
  tanggal?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  pembuka?: string | null;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(100_000)
  isi: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  penutup?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sumber?: string | null;
}
