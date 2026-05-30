import { Module } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { AudioModule } from '../audio/audio.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SholatModule } from '../sholat/sholat.module';
import { TafsirModule } from '../tafsir/tafsir.module';
import { TranslationModule } from '../translation/translation.module';
import { SeedController } from './seed.controller';
import { SeedGateway } from './seed.gateway';
import { SeedService } from './seed.service';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [AudioModule, TranslationModule, TafsirModule, SholatModule],
  controllers: [SeedController],
  providers: [
    SeedService,
    SeedGateway,
    SnapshotService,
    // Guard composition: any admin can use JWT, scripts/cron keep seed key.
    AdminKeyGuard,
    JwtAuthGuard,
    JwtOrAdminKeyGuard,
  ],
  exports: [SeedService, SnapshotService],
})
export class SeedModule {}
