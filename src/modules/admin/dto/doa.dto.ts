import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Trim strings; leave non-strings (null/undefined) untouched for IsOptional. */
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Empty string → null, so optional fields persist as NULL not "". */
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/**
 * Body for POST/PUT `/admin/content/doa`. Previously the controller used a
 * bare `DoaInput` interface, which the global ValidationPipe cannot validate —
 * so empty/whitespace payloads were silently accepted. This DTO enforces the
 * required fields and normalises the optional ones.
 */
export class DoaDto {
  @ApiProperty({ example: 'Doa Sebelum Makan' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Judul wajib diisi' })
  @MaxLength(200)
  judul: string;

  @ApiProperty({ example: 'اَللَّهُمَّ بَارِكْ لَنَا' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Teks Arab wajib diisi' })
  @MaxLength(5000)
  arab: string;

  @ApiPropertyOptional({ example: 'Allahumma barik lana' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  latin?: string;

  @ApiProperty({ example: 'Ya Allah, berkahilah kami…' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Terjemah wajib diisi' })
  @MaxLength(5000)
  terjemah: string;

  @ApiPropertyOptional({ example: 'HR. Bukhari', nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sumber?: string | null;

  @ApiPropertyOptional({ example: 'Doa Harian', nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  grup?: string | null;

  @ApiPropertyOptional({ example: 'makan', nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tag?: string | null;
}
