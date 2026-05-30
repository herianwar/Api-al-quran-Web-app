import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AnalyticsAdminController,
  AnalyticsController,
} from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController, AnalyticsAdminController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
