import { Module } from '@nestjs/common';
import { WiridController } from './wirid.controller';
import { WiridService } from './wirid.service';

@Module({
  controllers: [WiridController],
  providers: [WiridService],
})
export class WiridModule {}
