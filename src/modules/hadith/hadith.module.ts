import { Module } from '@nestjs/common';
import { HadithController } from './hadith.controller';
import { HadithService } from './hadith.service';

@Module({
  controllers: [HadithController],
  providers: [HadithService],
  exports: [HadithService],
})
export class HadithModule {}
