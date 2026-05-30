import { Module } from '@nestjs/common';
import { AsmaulHusnaController } from './asmaul-husna.controller';
import { AsmaulHusnaService } from './asmaul-husna.service';

@Module({
  controllers: [AsmaulHusnaController],
  providers: [AsmaulHusnaService],
})
export class AsmaulHusnaModule {}
