import { Module } from '@nestjs/common';
import { AdzanController } from './adzan.controller';
import { AdzanService } from './adzan.service';

@Module({
  controllers: [AdzanController],
  providers: [AdzanService],
})
export class AdzanModule {}
