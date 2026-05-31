import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PageViewDto {
  @ApiProperty({
    description: 'Pathname only (no query, no fragment).',
    example: '/surat/2',
  })
  @IsString()
  @MaxLength(255)
  path: string;

  @ApiPropertyOptional({
    description:
      'Per-browser session id stored in localStorage. Random 16-char string. Server falls back to creating its own if absent.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @ApiPropertyOptional({ description: 'document.referrer at visit time.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referer?: string;
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Window in days (1, 7, 30). Default 7.',
    example: 7,
  })
  @IsOptional()
  @IsString()
  range?: string;
}

export class ApiUsageQueryDto {
  @ApiPropertyOptional({
    description: 'Window in days (1, 7, 30, 90). Default 7.',
    example: 7,
  })
  @IsOptional()
  @IsString()
  range?: string;

  @ApiPropertyOptional({
    description: 'Filter to a single app by its API key id.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  appId?: string;
}
