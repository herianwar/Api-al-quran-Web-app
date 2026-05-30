import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

export class AyatRujukanDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  surah: number;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(1)
  ayat: number;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  catatan?: string | null;
}

/**
 * Body for editing one of the 25 nabi. Urutan & slug are immutable post-seed
 * (kept in the URL/path), so only the editorial fields are accepted here.
 */
export class NabiUpdateDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nama: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  namaArab: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  gelar?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  periode?: string | null;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(20_000)
  ringkasan: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(200_000)
  kisah: string;

  @ApiPropertyOptional({
    type: [AyatRujukanDto],
    description: 'Daftar ayat rujukan',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AyatRujukanDto)
  ayatRujukan?: AyatRujukanDto[];
}
