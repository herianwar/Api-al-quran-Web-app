import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/**
 * Body for editing one of the 99 names. The core fields (arab, latin, arti)
 * are fixed by religious convention and not editable from the panel — only
 * the editorial detail fields (penjelasan/dalil/faidah) are.
 */
export class AsmaulHusnaUpdateDto {
  @ApiPropertyOptional({
    description: '1-2 paragraf penjelasan makna nama',
    nullable: true,
  })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  penjelasan?: string | null;

  @ApiPropertyOptional({
    example: 'Q.S. Al-Hashr: 22-24',
    nullable: true,
  })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dalil?: string | null;

  @ApiPropertyOptional({
    description: 'Faidah / hikmah penerapan',
    nullable: true,
  })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  faidah?: string | null;
}
