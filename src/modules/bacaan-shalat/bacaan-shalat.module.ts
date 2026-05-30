import { Module } from '@nestjs/common';
import { BacaanShalatController } from './bacaan-shalat.controller';
import { BacaanShalatService } from './bacaan-shalat.service';

@Module({
  controllers: [BacaanShalatController],
  providers: [BacaanShalatService],
})
export class BacaanShalatModule {}
