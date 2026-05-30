import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @ApiProperty({
    description:
      'Map of setting key → new value. Empty string clears a secret.',
    example: {
      'ai.provider': 'openai',
      'ai.openai_api_key': 'sk-...',
    },
  })
  @IsObject()
  values: Record<string, string>;
}

export class UpdateSingleSettingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(8000)
  value: string;
}
