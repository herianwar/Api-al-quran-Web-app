import { Module } from '@nestjs/common';
import { AudioCacheService } from './audio-cache.service';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';

@Module({
  controllers: [AudioController],
  providers: [AudioService, AudioCacheService],
  exports: [AudioCacheService],
})
export class AudioModule {}
