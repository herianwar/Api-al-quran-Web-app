import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SeoAdminController } from './seo-admin.controller';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

/**
 * SEO module. PrismaService, SettingsService and AuditService are all global,
 * so we only need AuthModule for the JWT guard on the admin controller.
 */
@Module({
  imports: [AuthModule],
  controllers: [SeoController, SeoAdminController],
  providers: [SeoService],
  exports: [SeoService],
})
export class SeoModule {}
