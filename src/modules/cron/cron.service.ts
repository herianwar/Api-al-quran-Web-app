import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { NOTIFICATION_QUEUE, NotificationJobName } from './notification.processor';

/**
 * Schedules repeatable BullMQ jobs at app bootstrap. Idempotent: BullMQ
 * de-duplicates repeatable jobs by name + repeat options, so calling
 * `add()` again with the same options does NOT create a second schedule.
 */
@Injectable()
export class CronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CronService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Daily verse: 07:00 Asia/Jakarta = 00:00 UTC.
    await this.queue.add(
      'daily-verse' as NotificationJobName,
      {},
      {
        repeat: { pattern: '0 0 * * *', tz: 'UTC' },
        jobId: 'cron:daily-verse',
      },
    );

    // Hafalan reminder: 06:00 Asia/Jakarta = 23:00 UTC.
    await this.queue.add(
      'hafalan-reminder' as NotificationJobName,
      {},
      {
        repeat: { pattern: '0 23 * * *', tz: 'UTC' },
        jobId: 'cron:hafalan-reminder',
      },
    );

    // Puasa sunnah besok: 19:00 WIB = 12:00 UTC. Broadcast bila besok hari
    // puasa sunnah (Senin/Kamis, Ayyamul Bidh, Arafah, dll).
    await this.queue.add(
      'puasa-sunnah-besok' as NotificationJobName,
      {},
      {
        repeat: { pattern: '0 12 * * *', tz: 'UTC' },
        jobId: 'cron:puasa-sunnah-besok',
      },
    );

    // Perkiraan haid: 08:00 WIB = 01:00 UTC. Pengingat pribadi bila prediksi
    // siklus jatuh besok.
    await this.queue.add(
      'perkiraan-haid' as NotificationJobName,
      {},
      {
        repeat: { pattern: '0 1 * * *', tz: 'UTC' },
        jobId: 'cron:perkiraan-haid',
      },
    );

    // Jadwal sholat warm-up: 25th of every month at 03:00 WIB = 20:00 UTC on the
    // 24th UTC. We run on the 25th of the month (server local) so the next
    // month is already cached before users open the app on day 1. Idempotent —
    // months already cached skip without external calls.
    await this.queue.add(
      'jadwal-warm' as NotificationJobName,
      {},
      {
        repeat: { pattern: '0 20 24 * *', tz: 'UTC' },
        jobId: 'cron:jadwal-warm',
      },
    );

    // DB snapshot: 02:00 WIB = 19:00 UTC daily. Retention pruning runs in the
    // same job; only the freshest SNAPSHOT_RETENTION snapshots are kept.
    await this.queue.add(
      'db-snapshot' as NotificationJobName,
      {},
      {
        repeat: { pattern: '0 19 * * *', tz: 'UTC' },
        jobId: 'cron:db-snapshot',
      },
    );

    // API usage rollup + raw-log purge: 01:00 WIB = 18:00 UTC daily. Runs after
    // midnight so the just-completed day is fully aggregated before purge.
    await this.queue.add(
      'api-usage-rollup' as NotificationJobName,
      {},
      {
        repeat: { pattern: '0 18 * * *', tz: 'UTC' },
        jobId: 'cron:api-usage-rollup',
      },
    );

    this.logger.log(
      'Scheduled repeatable jobs: daily-verse, hafalan-reminder, puasa-sunnah-besok, perkiraan-haid, jadwal-warm, db-snapshot, api-usage-rollup',
    );
  }

  /** Manually trigger a notification job (admin convenience). */
  async triggerNow(
    name: NotificationJobName,
  ): Promise<ResponsePayload<unknown>> {
    const job = await this.queue.add(name, {}, { jobId: `manual:${name}:${Date.now()}` });
    return ok(
      { id: job.id, name },
      `Job "${name}" sudah di-queue, akan dieksekusi worker.`,
    );
  }

  async listSchedules(): Promise<ResponsePayload<unknown>> {
    const repeatable = await this.queue.getRepeatableJobs();
    return ok(
      repeatable.map((r) => ({
        name: r.name,
        pattern: r.pattern,
        next: r.next ? new Date(r.next).toISOString() : null,
        key: r.key,
      })),
      'Daftar cron job aktif',
      { total: repeatable.length },
    );
  }

  /** Live queue counts — useful for spotting stuck/failed jobs at a glance. */
  async getQueueStats(): Promise<ResponsePayload<unknown>> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );
    return ok(counts, 'Queue stats');
  }

  /**
   * Recent BullMQ jobs — mix of completed/failed/active so the admin UI can
   * show what happened on the last few cron fires + manual triggers without
   * tailing server logs.
   */
  async listRecentRuns(
    limit: number,
  ): Promise<ResponsePayload<unknown>> {
    const safe = Math.min(Math.max(limit, 1), 100);
    // Pull a bit extra from each bucket so the merged-sort isn't lopsided.
    const span = safe * 2;
    const [completed, failed, active] = await Promise.all([
      this.queue.getJobs(['completed'], 0, span, false),
      this.queue.getJobs(['failed'], 0, span, false),
      this.queue.getJobs(['active'], 0, span, false),
    ]);

    type RunStatus = 'completed' | 'failed' | 'active';
    interface Run {
      id: string | undefined;
      name: string;
      status: RunStatus;
      createdAt: string;
      startedAt: string | null;
      finishedAt: string | null;
      durationMs: number | null;
      attemptsMade: number;
      result: unknown;
      failedReason: string | null;
    }

    const mapJob = (status: RunStatus) => (j: typeof completed[number]): Run => {
      const started = j.processedOn ?? null;
      const finished = j.finishedOn ?? null;
      return {
        id: j.id,
        name: j.name,
        status,
        createdAt: new Date(j.timestamp).toISOString(),
        startedAt: started ? new Date(started).toISOString() : null,
        finishedAt: finished ? new Date(finished).toISOString() : null,
        durationMs: started && finished ? finished - started : null,
        attemptsMade: j.attemptsMade,
        // Trim result/failedReason so the response stays small.
        result: j.returnvalue ?? null,
        failedReason: j.failedReason ? String(j.failedReason).slice(0, 500) : null,
      };
    };

    const runs: Run[] = [
      ...completed.map(mapJob('completed')),
      ...failed.map(mapJob('failed')),
      ...active.map(mapJob('active')),
    ]
      // Most recent finish (or created, if still active) first.
      .sort((a, b) => {
        const aT = a.finishedAt ?? a.startedAt ?? a.createdAt;
        const bT = b.finishedAt ?? b.startedAt ?? b.createdAt;
        return bT.localeCompare(aT);
      })
      .slice(0, safe);

    return ok(runs, 'Recent runs', { total: runs.length });
  }
}
