import { Module } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ArtikelAdminController } from './artikel-admin.controller';
import { ArtikelController } from './artikel.controller';
import { ArtikelService } from './artikel.service';

@Module({
  controllers: [ArtikelController, ArtikelAdminController],
  providers: [
    ArtikelService,
    AdminKeyGuard,
    JwtAuthGuard,
    JwtOrAdminKeyGuard,
    RolesGuard,
  ],
  exports: [ArtikelService],
})
export class ArtikelModule {}
