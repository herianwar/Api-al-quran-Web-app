import { Module } from '@nestjs/common';
import { KhutbahController } from './khutbah.controller';
import { KhutbahService } from './khutbah.service';

@Module({
  controllers: [KhutbahController],
  providers: [KhutbahService],
})
export class KhutbahModule {}
