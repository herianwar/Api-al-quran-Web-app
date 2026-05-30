import { Module } from '@nestjs/common';
import { AsbabunNuzulController } from './asbabun-nuzul.controller';
import { AsbabunNuzulService } from './asbabun-nuzul.service';

@Module({
  controllers: [AsbabunNuzulController],
  providers: [AsbabunNuzulService],
})
export class AsbabunNuzulModule {}
