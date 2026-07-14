import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Dotted region code, e.g. "32" / "32.04" / "32.04.13". Digits + dots only. */
const KODE_PATTERN = /^[0-9.]+$/;

export class KabupatenQueryDto {
  @ApiProperty({ example: '32', description: 'Kode provinsi (wajib)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(13)
  @Matches(KODE_PATTERN, { message: 'provinsiId tidak valid' })
  provinsiId!: string;
}

export class KecamatanQueryDto {
  @ApiProperty({ example: '32.04', description: 'Kode kabupaten/kota (wajib)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(13)
  @Matches(KODE_PATTERN, { message: 'kabupatenId tidak valid' })
  kabupatenId!: string;
}

export class KelurahanQueryDto {
  @ApiProperty({ example: '32.04.13', description: 'Kode kecamatan (wajib)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(13)
  @Matches(KODE_PATTERN, { message: 'kecamatanId tidak valid' })
  kecamatanId!: string;
}
