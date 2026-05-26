import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Budi Santoso' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nama?: string;
}

export class UpdateProgressDto {
  @ApiProperty({ description: 'ID ayat (internal) posisi baca terakhir' })
  @IsInt()
  @Min(1)
  ayatId: number;
}

export class CreateBookmarkDto {
  @ApiProperty({ description: 'ID ayat (internal)' })
  @IsInt()
  @Min(1)
  ayatId: number;

  @ApiPropertyOptional({ example: 'Ayat favorit' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  catatan?: string;
}

export class CreateHafalanDto {
  @ApiProperty({ description: 'ID ayat (internal) yang dihafal' })
  @IsInt()
  @Min(1)
  ayatId: number;
}

export class ReviewHafalanDto {
  @ApiProperty({
    description: 'Apakah ayat berhasil diingat saat muraja\'ah',
    example: true,
  })
  @IsBoolean()
  remembered: boolean;
}
