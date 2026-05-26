import { Module } from '@nestjs/common';
import { SeedController } from './seed.controller';
import { SeedGateway } from './seed.gateway';
import { SeedService } from './seed.service';

@Module({
  controllers: [SeedController],
  providers: [SeedService, SeedGateway],
  exports: [SeedService],
})
export class SeedModule {}
