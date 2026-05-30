import { Module } from '@nestjs/common';
import { NabiController } from './nabi.controller';
import { NabiService } from './nabi.service';

@Module({
  controllers: [NabiController],
  providers: [NabiService],
})
export class NabiModule {}
