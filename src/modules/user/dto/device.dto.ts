import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const PLATFORMS = ['android', 'ios', 'web'] as const;
type Platform = (typeof PLATFORMS)[number];

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'FCM (Android/Web) or APNS (iOS) push token',
    minLength: 16,
    maxLength: 4096,
  })
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: PLATFORMS })
  @IsString()
  @IsIn(PLATFORMS as unknown as string[])
  platform!: Platform;

  @ApiPropertyOptional({
    description: 'Optional human-readable label, e.g. "Pixel 7 Pro"',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}
