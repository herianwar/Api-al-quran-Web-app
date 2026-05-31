import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationService } from '../notification/notification.service';
import { SeedService } from '../seed/seed.service';
import { SnapshotService } from '../seed/snapshot.service';

export const NOTIFICATION_QUEUE = 'notifications';

export type NotificationJobName =
  | 'daily-verse'
  | 'hafalan-reminder'
  | 'jadwal-warm'
  | 'db-snapshot'
  | 'api-usage-rollup';

/** Snapshots to keep on disk before older ones are pruned by the cron sweep. */
const SNAPSHOT_RETENTION = 14;

/**
 * BullMQ processor for scheduled notification jobs.
 *
 * Each job is idempotent: it picks deterministic content (e.g. "today's
 * verse" derived from the calendar date) so a duplicate fire doesn't send
 * duplicate notifications.
 */
@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationService,
    private readonly seed: SeedService,
    private readonly snapshot: SnapshotService,
    private readonly analytics: AnalyticsService,
  ) {
    super();
  }

  async process(job: Job<unknown, unknown, NotificationJobName>): Promise<unknown> {
    switch (job.name) {
      case 'daily-verse':
        return this.dailyVerse();
      case 'hafalan-reminder':
        return this.hafalanReminder();
      case 'jadwal-warm':
        return this.jadwalWarm();
      case 'db-snapshot':
        return this.dbSnapshot();
      case 'api-usage-rollup':
        return this.analytics.rollupAndPurgeApiUsage();
      default:
        this.logger.warn(`Unknown job name: ${job.name as string}`);
        return null;
    }
  }

  // ─── Jadwal sholat warm-up ──────────────────────────────────────────

  /**
   * Refresh the rolling 12-month window of prayer schedules. Idempotent: the
   * seed loop skips months already fully cached, so a daily/monthly run only
   * actually fetches the new boundary month from myquran.com.
   */
  private async jadwalWarm(): Promise<unknown> {
    this.logger.log('jadwal-warm: starting monthly refresh');
    await this.seed.warmJadwalSholat();
    return { ok: true };
  }

  // ─── DB snapshot ────────────────────────────────────────────────────

  /**
   * Take a pg_dump.gz snapshot and prune anything past the retention window.
   * Snapshots cover the content tables (surah/ayat/tafsir/doa/kota/jadwal);
   * user data is unaffected — those are in different tables.
   */
  private async dbSnapshot(): Promise<unknown> {
    const info = await this.snapshot.exportSnapshot();
    this.logger.log(`db-snapshot: created ${info.name}`);

    const all = await this.snapshot.list();
    if (all.length <= SNAPSHOT_RETENTION) {
      return { created: info.name, kept: all.length, pruned: 0 };
    }
    // listSnapshots returns newest first; everything past the retention slot
    // is older and safe to delete.
    const toPrune = all.slice(SNAPSHOT_RETENTION);
    let pruned = 0;
    for (const s of toPrune) {
      try {
        await this.snapshot.deleteSnapshot(s.name);
        pruned++;
      } catch (err) {
        this.logger.warn(
          `db-snapshot: failed to prune ${s.name}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `db-snapshot: created ${info.name}, pruned ${pruned} old snapshot(s)`,
    );
    return { created: info.name, kept: SNAPSHOT_RETENTION, pruned };
  }

  // ─── Daily verse ────────────────────────────────────────────────────

  /**
   * Pick "today's verse" deterministically: ayat at index (dayOfYear %
   * total). Send to every user with at least one registered device.
   */
  private async dailyVerse(): Promise<unknown> {
    const total = await this.prisma.ayat.count();
    if (total === 0) {
      this.logger.warn('daily-verse: ayat table empty, skip');
      return { skipped: true };
    }
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 0));
    const diff =
      today.getTime() - start.getTime() + (start.getTimezoneOffset() - today.getTimezoneOffset()) * 60_000;
    const dayOfYear = Math.floor(diff / 86_400_000);
    const skip = dayOfYear % total;

    const [ayat] = await this.prisma.ayat.findMany({
      skip,
      take: 1,
      orderBy: { id: 'asc' },
      select: {
        nomorAyat: true,
        teksIndonesia: true,
        surah: { select: { nomor: true, namaLatin: true } },
      },
    });
    if (!ayat) {
      this.logger.warn('daily-verse: query returned empty');
      return { skipped: true };
    }

    const title = `Ayat Hari Ini — ${ayat.surah.namaLatin} ${ayat.surah.nomor}:${ayat.nomorAyat}`;
    const body = this.truncate(ayat.teksIndonesia, 240);
    const result = await this.notif.sendBroadcast({
      title,
      body,
      data: { deeplink: `/surat/${ayat.surah.nomor}#${ayat.nomorAyat}` },
    });
    this.logger.log(
      `daily-verse: ${result.successful}/${result.attempted} sent, ${result.invalidTokensRemoved} stale tokens removed`,
    );
    return result;
  }

  // ─── Hafalan reminder ───────────────────────────────────────────────

  /**
   * Send a personalized reminder to each user who has hafalan due today.
   * "Due today" = nextReviewAt <= now. One push per user (not per ayat).
   */
  private async hafalanReminder(): Promise<unknown> {
    const now = new Date();
    const dueByUser = await this.prisma.hafalan.groupBy({
      by: ['userId'],
      where: { nextReviewAt: { lte: now } },
      _count: { _all: true },
    });

    let sent = 0;
    let invalid = 0;
    for (const row of dueByUser) {
      const result = await this.notif.sendToUser(row.userId, {
        title: "Waktunya muraja'ah!",
        body: `Ada ${row._count._all} ayat yang perlu kamu ulang hari ini.`,
        data: { deeplink: '/me' },
      });
      sent += result.successful;
      invalid += result.invalidTokensRemoved;
    }
    this.logger.log(
      `hafalan-reminder: ${sent} sent across ${dueByUser.length} users, ${invalid} stale tokens removed`,
    );
    return { users: dueByUser.length, sent, invalid };
  }

  private truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + '…';
  }
}
