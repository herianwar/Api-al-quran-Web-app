import { Module } from '@nestjs/common';
import { DoaController } from './doa.controller';
import { DoaService } from './doa.service';

@Module({
  controllers: [DoaController],
  providers: [DoaService],
})
export class DoaModule {}
