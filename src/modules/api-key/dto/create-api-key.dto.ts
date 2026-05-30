import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};

/**
 * Body for POST `/admin/api-keys`. Replaces the bare `CreateApiKeyInput`
 * interface so the global ValidationPipe actually checks it (previously a
 * malformed `expiresAt: "abc"` would silently bubble into Prisma as
 * Invalid Date and surface as a 500).
 */
export class CreateApiKeyDto {
  @ApiProperty({ example: 'Android v1.0', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Nama wajib diisi' })
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    default: 'read',
    description: 'Comma-separated scopes (read, write) atau "*"',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^(\*|[a-z]+(?:,[a-z]+)*)$/, {
    message: 'Scopes harus berupa "*" atau daftar kata seperti "read,write"',
  })
  scopes?: string = 'read';

  @ApiPropertyOptional({ default: 0, description: 'req/menit; 0 = pakai default global' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  rateLimit?: number;

  @ApiPropertyOptional({
    example: '2027-01-01',
    description: 'Tanggal kadaluwarsa ISO-8601. Kosong = tidak pernah.',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601(undefined, { message: 'expiresAt harus tanggal ISO-8601' })
  expiresAt?: string;
}
