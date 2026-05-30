import { Module } from '@nestjs/common';
import { TafsirController } from './tafsir.controller';
import { TafsirService } from './tafsir.service';

@Module({
  controllers: [TafsirController],
  providers: [TafsirService],
  exports: [TafsirService],
})
export class TafsirModule {}
