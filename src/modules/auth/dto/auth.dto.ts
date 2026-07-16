import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Normalize an Indonesian phone number to E.164 (+62xxxxxxxxxx).
 * Accepts spaces / dashes and the common `0`, `62`, `+62` prefixes.
 * Returns `undefined` for empty/blank input so `@IsOptional` skips it
 * (stored as NULL). Non-string / unrecognized input is returned as-is
 * (possibly cleaned) so validation reports a clear error instead.
 */
export function normalizeNoHp(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const s = value.replace(/[\s-]/g, '');
  if (s === '') return undefined;
  if (s.startsWith('+62')) return s;
  if (s.startsWith('62')) return '+' + s;
  if (s.startsWith('0')) return '+62' + s.slice(1);
  return s;
}

/**
 * Normalize an email for case-insensitive matching: trim surrounding
 * whitespace and lowercase it. Non-string input is returned as-is so
 * `@IsEmail` reports a clear validation error instead.
 */
export function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail({}, { message: 'Email tidak valid' })
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @MaxLength(72, { message: 'Password maksimal 72 karakter' })
  password: string;

  @ApiPropertyOptional({ example: 'Budi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nama?: string;

  @ApiPropertyOptional({
    example: '081234567890',
    description: 'Nomor HP; dinormalisasi ke E.164 (+62...). Opsional.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNoHp(value))
  @IsString({ message: 'Nomor HP tidak valid' })
  @Matches(/^\+62\d{7,14}$/, { message: 'Nomor HP tidak valid' })
  noHp?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail({}, { message: 'Email tidak valid' })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(1, { message: 'Password wajib diisi' })
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  @MinLength(10)
  refreshToken: string;
}
