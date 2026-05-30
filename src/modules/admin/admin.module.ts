import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TopicModule } from '../topic/topic.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminContentController } from './content.controller';
import { AdminContentService } from './content.service';

/**
 * AdminContentController needs TopicService for the Topic Explorer AI
 * actions (summary/expand/plan/discover). Importing TopicModule is the
 * cleanest way since TopicService now exports itself.
 */
@Module({
  imports: [AuthModule, TopicModule],
  controllers: [AdminController, AdminContentController],
  providers: [AdminService, AdminContentService],
})
export class AdminModule {}
