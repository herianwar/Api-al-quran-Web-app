import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination';

export class AskQueryDto {
  @ApiProperty({
    description: 'Pertanyaan natural-language',
    example: 'ayat tentang keluarga',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  q: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Skip GPT summary for this query.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  withSummary?: boolean;

  @ApiPropertyOptional({
    description: 'Lanjutkan conversation ID dari turn sebelumnya.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  conversationId?: string;
}

class ConversationTurnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  q: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  hitIds?: number[];
}

export class AskBodyDto {
  @ApiProperty({ example: 'ayat tentang keluarga' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  q: string;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  withSummary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  conversationId?: string;

  @ApiPropertyOptional({
    type: [ConversationTurnDto],
    description: 'History turn sebelumnya untuk konteks (max 5)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  history?: ConversationTurnDto[];
}

export class AiQueriesListDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Only no-good-match queries (topScore<0.3 or empty)',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyNoResults?: boolean;
}
