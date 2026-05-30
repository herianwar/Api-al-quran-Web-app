import { Module } from '@nestjs/common';
import { AyatKataController } from './ayat-kata.controller';
import { AyatKataService } from './ayat-kata.service';

@Module({
  controllers: [AyatKataController],
  providers: [AyatKataService],
})
export class AyatKataModule {}
