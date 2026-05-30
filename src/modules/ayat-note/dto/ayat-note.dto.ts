import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

export class CreateAyatNoteDto {
  @ApiProperty({ description: 'ID ayat (internal)' })
  @IsInt()
  @Min(1)
  ayatId: number;

  @ApiPropertyOptional({ example: 'Pelajaran tentang sabar' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  judul?: string;

  @ApiProperty({ example: 'Ayat ini mengajarkan…' })
  @IsString()
  @MaxLength(4000)
  body: string;
}

export class UpdateAyatNoteDto {
  @ApiPropertyOptional({ example: 'Judul baru' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  judul?: string;

  @ApiPropertyOptional({ example: 'Isi catatan diperbarui' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

export class AyatNoteQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter berdasarkan ayatId tertentu',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ayatId?: number;
}
