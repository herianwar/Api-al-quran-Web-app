import { Module } from '@nestjs/common';
import { NiatShalatController } from './niat-shalat.controller';
import { NiatShalatService } from './niat-shalat.service';

@Module({
  controllers: [NiatShalatController],
  providers: [NiatShalatService],
  exports: [NiatShalatService],
})
export class NiatShalatModule {}
