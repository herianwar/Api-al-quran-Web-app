import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from '../notification/notification.service';
import { CronService } from './cron.service';
import { BroadcastDto } from './dto/broadcast.dto';
import { NotificationJobName } from './notification.processor';

interface AdminCtx {
  userId: string;
  email: string;
}

const VALID_JOBS: NotificationJobName[] = ['daily-verse', 'hafalan-reminder'];

@ApiTags('Cron / Notifications (Admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/cron')
export class CronController {
  constructor(
    private readonly cron: CronService,
    private readonly notif: NotificationService,
    private readonly audit: AuditService,
  ) {}

  @Get('schedules')
  @ApiOperation({ summary: 'List jadwal cron yang aktif' })
  schedules() {
    return this.cron.listSchedules();
  }

  @Get('queue-stats')
  @ApiOperation({ summary: 'Live BullMQ counts (waiting/active/completed/failed/delayed)' })
  queueStats() {
    return this.cron.getQueueStats();
  }

  @Get('runs')
  @ApiOperation({
    summary:
      'Riwayat eksekusi job terbaru (mix completed/failed/active, sorted newest first).',
  })
  runs(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 20;
    return this.cron.listRecentRuns(Number.isFinite(n) ? n : 20);
  }

  @Get('broadcast/preview')
  @ApiOperation({
    summary: 'Status push (FCM aktif?) + jumlah device target broadcast',
  })
  async broadcastPreview(): Promise<ResponsePayload<unknown>> {
    const data = await this.notif.broadcastTargets();
    return ok(data, 'Status broadcast');
  }

  @Post('broadcast')
  @ApiOperation({
    summary:
      'Kirim push notification custom ke semua device. Body: { title, body, deeplink? }.',
  })
  async broadcast(
    @Body() body: BroadcastDto,
    @CurrentUser() actor: AdminCtx,
  ): Promise<ResponsePayload<unknown>> {
    const result = await this.notif.sendBroadcast(
      {
        title: body.title,
        body: body.body,
        data: body.deeplink ? { deeplink: body.deeplink } : undefined,
        imageUrl: body.imageUrl,
      },
      actor.userId,
    );
    await this.audit.log({
      action: 'broadcast.send',
      actorId: actor.userId,
      actorEmail: actor.email,
      target: `broadcast:${result.broadcastId}`,
      metadata: {
        title: body.title,
        attempted: result.attempted,
        successful: result.successful,
        failed: result.failed,
      },
    });
    return ok(result, 'Broadcast push dikirim');
  }

  @Post('run/:job')
  @ApiParam({ name: 'job', enum: VALID_JOBS })
  @ApiOperation({
    summary:
      'Trigger 1 notification job sekarang. Pilihan: daily-verse, hafalan-reminder.',
  })
  async runNow(
    @Param('job') job: string,
    @CurrentUser() actor: AdminCtx,
  ): Promise<ResponsePayload<unknown>> {
    if (!VALID_JOBS.includes(job as NotificationJobName)) {
      throw new BadRequestException({
        message: `job harus salah satu: ${VALID_JOBS.join(', ')}`,
        error: 'BAD_REQUEST',
      });
    }
    await this.audit.log({
      action: 'cron.trigger',
      actorId: actor.userId,
      actorEmail: actor.email,
      target: `job:${job}`,
    });
    return this.cron.triggerNow(job as NotificationJobName);
  }
}
