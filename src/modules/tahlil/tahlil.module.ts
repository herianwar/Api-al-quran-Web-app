import { Module } from '@nestjs/common';
import { TahlilController } from './tahlil.controller';
import { TahlilService } from './tahlil.service';

@Module({
  controllers: [TahlilController],
  providers: [TahlilService],
})
export class TahlilModule {}
