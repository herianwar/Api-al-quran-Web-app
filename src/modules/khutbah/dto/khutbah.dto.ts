import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

export class KhutbahQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter berdasarkan tema' })
  @IsOptional()
  @IsString()
  tema?: string;

  @ApiPropertyOptional({ description: 'Cari di judul / tema' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class KhutbahDto {
  @ApiPropertyOptional({ example: 'takwa-bekal-terbaik' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug hanya huruf kecil, angka, dan tanda hubung',
  })
  slug: string;

  @IsString()
  judul: string;

  @IsOptional()
  @IsString()
  tema?: string;

  @IsOptional()
  @Type(() => Date)
  tanggal?: Date;

  @IsString()
  isi: string;

  @IsOptional()
  @IsString()
  pembuka?: string;

  @IsOptional()
  @IsString()
  penutup?: string;

  @IsOptional()
  @IsString()
  sumber?: string;
}
