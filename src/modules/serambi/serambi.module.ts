import { Module } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SerambiAdminController } from './serambi-admin.controller';
import { SerambiController } from './serambi.controller';
import { SerambiService } from './serambi.service';

@Module({
  imports: [AuthModule],
  controllers: [SerambiController, SerambiAdminController],
  providers: [
    SerambiService,
    AdminKeyGuard,
    JwtAuthGuard,
    JwtOrAdminKeyGuard,
    RolesGuard,
  ],
  exports: [SerambiService],
})
export class SerambiModule {}
