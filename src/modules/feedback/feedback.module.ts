import { Module } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedbackAdminController } from './feedback-admin.controller';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController, FeedbackAdminController],
  providers: [
    FeedbackService,
    AdminKeyGuard,
    JwtAuthGuard,
    JwtOrAdminKeyGuard,
    RolesGuard,
  ],
  exports: [FeedbackService],
})
export class FeedbackModule {}
