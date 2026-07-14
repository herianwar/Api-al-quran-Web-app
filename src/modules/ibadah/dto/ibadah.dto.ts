import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Lima waktu sholat wajib — urutan sepanjang hari. */
export const PRAYERS = [
  'subuh',
  'dzuhur',
  'ashar',
  'maghrib',
  'isya',
] as const;
export type Prayer = (typeof PRAYERS)[number];

/** Tiga item non-sholat yang disinkron per hari (aktivitas hari itu). */
export const EXTRA_ITEMS = ['dzikir', 'tilawah', 'hafalan'] as const;

/** Kedelapan item ibadah harian: 5 waktu sholat + dzikir/tilawah/hafalan. */
export const ITEMS = [...PRAYERS, ...EXTRA_ITEMS] as const;
export type IbadahItem = (typeof ITEMS)[number];

/** Format tanggal lokal user `YYYY-MM-DD`. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class SetSholatDto {
  @ApiProperty({
    enum: PRAYERS,
    example: 'subuh',
    description: 'Waktu sholat yang ditandai',
  })
  @IsString()
  @IsIn(PRAYERS as unknown as string[], {
    message: 'prayer harus salah satu: subuh, dzuhur, ashar, maghrib, isya',
  })
  prayer: Prayer;

  @ApiProperty({
    example: true,
    description: 'true = sudah sholat, false = batalkan tanda',
  })
  @IsBoolean()
  done: boolean;
}

export class SetItemDto {
  @ApiProperty({
    enum: ITEMS,
    example: 'dzikir',
    description:
      'Item ibadah yang ditandai: 5 waktu sholat + dzikir/tilawah/hafalan',
  })
  @IsString()
  @IsIn(ITEMS as unknown as string[], {
    message:
      'item harus salah satu: subuh, dzuhur, ashar, maghrib, isya, dzikir, tilawah, hafalan',
  })
  item: IbadahItem;

  @ApiProperty({
    example: true,
    description: 'true = tandai selesai, false = batalkan tanda',
  })
  @IsBoolean()
  done: boolean;

  @ApiPropertyOptional({
    example: '2026-07-13',
    description:
      'Tanggal lokal user (YYYY-MM-DD). Default hari ini (WIB) bila kosong.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'date harus format YYYY-MM-DD' })
  date?: string;
}

export class IbadahHistoryQueryDto {
  @ApiPropertyOptional({
    example: '2026-07-01',
    description: 'Tanggal awal rentang (YYYY-MM-DD). Default 30 hari lalu.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'from harus format YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
    description: 'Tanggal akhir rentang (YYYY-MM-DD). Default hari ini (WIB).',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'to harus format YYYY-MM-DD' })
  to?: string;
}

export class IbadahSummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Jumlah hari ke belakang (termasuk hari ini). Default 7.',
    default: 7,
    minimum: 1,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
