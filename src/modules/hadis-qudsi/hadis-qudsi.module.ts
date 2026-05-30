import { Module } from '@nestjs/common';
import { HadisQudsiController } from './hadis-qudsi.controller';
import { HadisQudsiService } from './hadis-qudsi.service';

@Module({
  controllers: [HadisQudsiController],
  providers: [HadisQudsiService],
})
export class HadisQudsiModule {}
