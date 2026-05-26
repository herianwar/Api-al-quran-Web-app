import { Global, Module } from '@nestjs/common';
import { EquranService } from './equran.service';

@Global()
@Module({
  providers: [EquranService],
  exports: [EquranService],
})
export class EquranModule {}
