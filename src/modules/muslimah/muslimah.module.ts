import { Module } from '@nestjs/common';
import { MuslimahController } from './muslimah.controller';
import { MuslimahService } from './muslimah.service';

@Module({
  controllers: [MuslimahController],
  providers: [MuslimahService],
})
export class MuslimahModule {}
