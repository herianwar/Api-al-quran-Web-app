import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { SeedModule } from '../seed/seed.module';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import {
  NOTIFICATION_QUEUE,
  NotificationProcessor,
} from './notification.processor';

@Module({
  imports: [
    AuthModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host') ?? 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
          password: config.get<string>('redis.password') || undefined,
        },
      }),
    }),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
    SeedModule,
  ],
  controllers: [CronController],
  providers: [CronService, NotificationProcessor],
})
export class CronModule {}
