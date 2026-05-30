import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * Global so cron jobs + admin endpoints + any future module can inject
 * NotificationService without re-importing.
 */
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
