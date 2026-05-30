import { Module } from '@nestjs/common';
import { SirahController } from './sirah.controller';
import { SirahService } from './sirah.service';

@Module({
  controllers: [SirahController],
  providers: [SirahService],
})
export class SirahModule {}
