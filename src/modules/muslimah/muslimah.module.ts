import { Module } from '@nestjs/common';
import { MuslimahController } from './muslimah.controller';
import { MoodService } from './muslimah.mood.service';
import { MuslimahService } from './muslimah.service';

@Module({
  controllers: [MuslimahController],
  providers: [MuslimahService, MoodService],
})
export class MuslimahModule {}
