import { Global, Module } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';

/**
 * Global so any guard/middleware in the app can inject ApiKeyService
 * without re-importing the module. The local guard providers exist so
 * `JwtOrAdminKeyGuard` can compose them via DI.
 */
@Global()
@Module({
  controllers: [ApiKeyController],
  providers: [
    ApiKeyService,
    AdminKeyGuard,
    JwtAuthGuard,
    JwtOrAdminKeyGuard,
  ],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
