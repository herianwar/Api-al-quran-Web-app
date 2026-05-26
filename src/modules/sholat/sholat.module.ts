import { Module } from '@nestjs/common';
import { SholatController } from './sholat.controller';
import { SholatService } from './sholat.service';

@Module({
  controllers: [SholatController],
  providers: [SholatService],
})
export class SholatModule {}
