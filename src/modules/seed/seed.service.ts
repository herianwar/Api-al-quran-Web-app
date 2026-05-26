import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EquranService } from '../../common/equran/equran.service';
import { EquranDoaItem } from '../../common/equran/equran.types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SeedGateway } from './seed.gateway';

export type SeedJobName = 'surah' | 'ayat' | 'tafsir' | 'doa';
const ALL_JOBS: SeedJobName[] = ['surah', 'ayat', 'tafsir', 'doa'];
const TOTAL_SURAH = 114;

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly equran: EquranService,
    private readonly redis: RedisService,
    private readonly gateway: SeedGateway,
  ) {}

  // ─── Public triggers (fire-and-forget) ──────────────────────────────

  startAll(): { started: boolean; jobs: SeedJobName[] } {
    if (this.running.size > 0) {
      throw new ConflictException({
        message: 'Proses seeding sedang berjalan',
        error: 'CONFLICT',
      });
    }
    void this.runAll();
    return { started: true, jobs: ALL_JOBS };
  }

  startJob(job: SeedJobName): { started: boolean; job: SeedJobName } {
    if (this.running.has(job)) {
      throw new ConflictException({
        message: `Seeding job "${job}" sedang berjalan`,
        error: 'CONFLICT',
      });
    }
    void this.runJob(job);
    return { started: true, job };
  }

  private async runAll(): Promise<void> {
    for (const job of ALL_JOBS) {
      await this.runJob(job);
    }
  }

  private async runJob(job: SeedJobName): Promise<void> {
    switch (job) {
      case 'surah':
        return this.seedSurah();
      case 'ayat':
        return this.seedAyat();
      case 'tafsir':
        return this.seedTafsir();
      case 'doa':
        return this.seedDoa();
    }
  }

  // ─── Status ─────────────────────────────────────────────────────────

  async getStatus() {
    const logs = await this.prisma.seedLog.findMany({
      orderBy: { jobName: 'asc' },
    });
    // Ensure all jobs are represented even before first run.
    const byName = new Map(logs.map((l) => [l.jobName, l]));
    return ALL_JOBS.map((job) => byName.get(job) ?? this.emptyStatus(job));
  }

  async getJobStatus(job: SeedJobName) {
    const log = await this.prisma.seedLog.findUnique({
      where: { jobName: job },
    });
    return log ?? this.emptyStatus(job);
  }

  async reset(): Promise<{ message: string }> {
    if (this.running.size > 0) {
      throw new ConflictException({
        message: 'Tidak bisa reset saat seeding berjalan',
        error: 'CONFLICT',
      });
    }
    // Order matters because of FK constraints.
    await this.prisma.tafsirAyat.deleteMany();
    await this.prisma.tafsir.deleteMany();
    await this.prisma.ayat.deleteMany();
    await this.prisma.surah.deleteMany();
    await this.prisma.doa.deleteMany();
    await this.prisma.seedLog.deleteMany();
    await this.redis.delByPattern('surah:*');
    await this.redis.delByPattern('ayat:*');
    await this.redis.delByPattern('tafsir:*');
    await this.redis.delByPattern('juz:*');
    await this.redis.delByPattern('halaman:*');
    await this.redis.del('doa:all');
    await this.redis.delByPattern('doa:*');
    this.gateway.emitLog('warn', 'Semua data Quran/tafsir/doa telah direset');
    return { message: 'Semua data berhasil direset' };
  }

  private emptyStatus(job: string) {
    return {
      id: 0,
      jobName: job,
      status: 'pending',
      totalItems: 0,
      doneItems: 0,
      errorMsg: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ─── Seed: Surah ────────────────────────────────────────────────────

  async seedSurah(): Promise<void> {
    const job: SeedJobName = 'surah';
    this.running.add(job);
    const startedAt = new Date();
    try {
      await this.markRunning(job, TOTAL_SURAH, startedAt);
      this.gateway.emitLog('info', 'Mulai seeding daftar surat...');

      const list = await this.equran.getSuratList();
      let done = 0;
      for (const s of list) {
        await this.prisma.surah.upsert({
          where: { nomor: s.nomor },
          create: {
            nomor: s.nomor,
            nama: s.nama,
            namaLatin: s.namaLatin,
            arti: s.arti,
            jumlahAyat: s.jumlahAyat,
            tempatTurun: s.tempatTurun,
            deskripsi: s.deskripsi ?? '',
            audioFullUrl: (s.audioFull ?? {}) as Prisma.InputJsonValue,
          },
          update: {
            nama: s.nama,
            namaLatin: s.namaLatin,
            arti: s.arti,
            jumlahAyat: s.jumlahAyat,
            tempatTurun: s.tempatTurun,
            deskripsi: s.deskripsi ?? '',
            audioFullUrl: (s.audioFull ?? {}) as Prisma.InputJsonValue,
          },
        });
        done++;
        await this.tick(job, done, list.length, startedAt, `${s.namaLatin} (${s.nomor})`);
        this.gateway.emitLog('success', `Surat ${s.nomor} - ${s.namaLatin} tersimpan`);
      }

      await this.redis.del('surah:list');
      await this.markDone(job, done, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'daftar surat',
        error: (error as Error).message,
        retrying: false,
      });
    } finally {
      this.running.delete(job);
    }
  }

  // ─── Seed: Ayat ─────────────────────────────────────────────────────

  async seedAyat(): Promise<void> {
    const job: SeedJobName = 'ayat';
    this.running.add(job);
    const startedAt = new Date();
    let totalAyat = 0;
    try {
      await this.markRunning(job, TOTAL_SURAH, startedAt);
      this.gateway.emitLog('info', 'Mulai seeding ayat + audio...');

      for (let nomor = 1; nomor <= TOTAL_SURAH; nomor++) {
        try {
          const detail = await this.equran.getSuratDetail(nomor);
          const surah = await this.prisma.surah.findUnique({
            where: { nomor },
          });
          if (!surah) {
            this.gateway.emitLog(
              'warn',
              `Surat ${nomor} belum ada di DB, jalankan seed surah dulu`,
            );
            continue;
          }

          // Page/juz numbers come from a supplementary source (Quran.com);
          // empty map when disabled or unreachable — columns stay null.
          const pageInfo = await this.equran.getAyatPageInfo(nomor);
          const pageByAyat = new Map(
            pageInfo.map((p) => [p.nomorAyat, p]),
          );

          for (const a of detail.ayat) {
            const meta = pageByAyat.get(a.nomorAyat);
            await this.prisma.ayat.upsert({
              where: {
                surahId_nomorAyat: {
                  surahId: surah.id,
                  nomorAyat: a.nomorAyat,
                },
              },
              create: {
                surahId: surah.id,
                nomorAyat: a.nomorAyat,
                teksArab: a.teksArab,
                teksLatin: a.teksLatin,
                teksIndonesia: a.teksIndonesia,
                audioUrls: (a.audio ?? {}) as Prisma.InputJsonValue,
                juz: meta?.juz ?? null,
                halaman: meta?.page ?? null,
              },
              update: {
                teksArab: a.teksArab,
                teksLatin: a.teksLatin,
                teksIndonesia: a.teksIndonesia,
                audioUrls: (a.audio ?? {}) as Prisma.InputJsonValue,
                ...(meta?.juz != null ? { juz: meta.juz } : {}),
                ...(meta?.page != null ? { halaman: meta.page } : {}),
              },
            });
            totalAyat++;
          }

          await this.tick(
            job,
            nomor,
            TOTAL_SURAH,
            startedAt,
            `${detail.namaLatin} (${nomor})`,
          );
          this.gateway.emitLog(
            'success',
            `Surat ${nomor} - ${detail.ayat.length} ayat tersimpan`,
          );
          await this.equran.delay();
        } catch (itemError) {
          this.gateway.emitError({
            job,
            failedItem: `Surah ${nomor}`,
            error: (itemError as Error).message,
            retrying: false,
          });
          this.logger.warn(
            `Gagal seed ayat surat ${nomor}: ${(itemError as Error).message}`,
          );
        }
      }

      await this.redis.delByPattern('surah:*');
      await this.redis.delByPattern('ayat:*');
      await this.redis.delByPattern('juz:*');
      await this.redis.delByPattern('halaman:*');
      await this.markDone(job, totalAyat, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    } finally {
      this.running.delete(job);
    }
  }

  // ─── Seed: Tafsir ───────────────────────────────────────────────────

  async seedTafsir(): Promise<void> {
    const job: SeedJobName = 'tafsir';
    this.running.add(job);
    const startedAt = new Date();
    let totalEntries = 0;
    try {
      await this.markRunning(job, TOTAL_SURAH, startedAt);
      this.gateway.emitLog('info', 'Mulai seeding tafsir Kemenag...');

      for (let nomor = 1; nomor <= TOTAL_SURAH; nomor++) {
        try {
          const surah = await this.prisma.surah.findUnique({
            where: { nomor },
          });
          if (!surah) {
            this.gateway.emitLog(
              'warn',
              `Surat ${nomor} belum ada di DB, lewati tafsir`,
            );
            continue;
          }

          const detail = await this.equran.getTafsir(nomor);
          const tafsir = await this.prisma.tafsir.upsert({
            where: {
              surahId_sumber: { surahId: surah.id, sumber: 'kemenag' },
            },
            create: { surahId: surah.id, sumber: 'kemenag' },
            update: {},
          });

          // Map nomorAyat -> ayat.id once per surah.
          const ayatRows = await this.prisma.ayat.findMany({
            where: { surahId: surah.id },
            select: { id: true, nomorAyat: true },
          });
          const ayatIdByNomor = new Map(
            ayatRows.map((r) => [r.nomorAyat, r.id]),
          );

          for (const t of detail.tafsir) {
            const ayatId = ayatIdByNomor.get(t.ayat);
            if (!ayatId) continue;
            await this.prisma.tafsirAyat.upsert({
              where: {
                tafsirId_ayatId: { tafsirId: tafsir.id, ayatId },
              },
              create: { tafsirId: tafsir.id, ayatId, teks: t.teks },
              update: { teks: t.teks },
            });
            totalEntries++;
          }

          await this.tick(
            job,
            nomor,
            TOTAL_SURAH,
            startedAt,
            `${detail.namaLatin} (${nomor})`,
          );
          this.gateway.emitLog('success', `Tafsir surat ${nomor} tersimpan`);
          await this.equran.delay();
        } catch (itemError) {
          this.gateway.emitError({
            job,
            failedItem: `Surah ${nomor}`,
            error: (itemError as Error).message,
            retrying: false,
          });
          this.logger.warn(
            `Gagal seed tafsir surat ${nomor}: ${(itemError as Error).message}`,
          );
        }
      }

      await this.redis.delByPattern('tafsir:*');
      await this.markDone(job, totalEntries, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    } finally {
      this.running.delete(job);
    }
  }

  // ─── Seed: Doa ──────────────────────────────────────────────────────

  async seedDoa(): Promise<void> {
    const job: SeedJobName = 'doa';
    this.running.add(job);
    const startedAt = new Date();
    try {
      this.gateway.emitLog('info', 'Mulai seeding doa & dzikir...');
      const list = await this.equran.getDoa();
      await this.markRunning(job, list.length, startedAt);

      let done = 0;
      for (const [index, item] of list.entries()) {
        const mapped = this.mapDoa(item, index);
        await this.prisma.doa.upsert({
          where: { id: mapped.id },
          create: mapped,
          update: {
            judul: mapped.judul,
            arab: mapped.arab,
            latin: mapped.latin,
            terjemah: mapped.terjemah,
            sumber: mapped.sumber,
            grup: mapped.grup,
            tag: mapped.tag,
          },
        });
        done++;
        await this.tick(job, done, list.length, startedAt, mapped.judul);
      }

      await this.redis.del('doa:all');
      await this.redis.delByPattern('doa:*');
      await this.markDone(job, done, startedAt);
      this.gateway.emitLog('success', `${done} doa tersimpan`);
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'doa',
        error: (error as Error).message,
        retrying: false,
      });
    } finally {
      this.running.delete(job);
    }
  }

  /** Defensive mapping of equran doa fields (names vary across versions). */
  private mapDoa(item: EquranDoaItem, index: number) {
    const tag = Array.isArray(item.tag)
      ? item.tag.join(', ')
      : (item.tag ?? null);
    return {
      id: item.id ?? index + 1,
      judul: item.nama ?? item.judul ?? `Doa ${index + 1}`,
      arab: item.ar ?? item.arab ?? '',
      latin: item.tr ?? item.latin ?? '',
      terjemah: item.idn ?? item.indo ?? item.terjemah ?? '',
      sumber: item.sumber ?? item.tentang ?? null,
      grup: item.grup ?? null,
      tag,
    };
  }

  // ─── SeedLog + progress helpers ─────────────────────────────────────

  private async markRunning(
    jobName: SeedJobName,
    totalItems: number,
    startedAt: Date,
  ): Promise<void> {
    await this.prisma.seedLog.upsert({
      where: { jobName },
      create: {
        jobName,
        status: 'running',
        totalItems,
        doneItems: 0,
        startedAt,
        errorMsg: null,
        finishedAt: null,
      },
      update: {
        status: 'running',
        totalItems,
        doneItems: 0,
        startedAt,
        errorMsg: null,
        finishedAt: null,
      },
    });
  }

  private async markDone(
    jobName: SeedJobName,
    doneItems: number,
    startedAt: Date,
  ): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.seedLog.update({
      where: { jobName },
      data: { status: 'done', doneItems, totalItems: doneItems, finishedAt },
    });
    this.gateway.emitDone({
      job: jobName,
      totalItems: doneItems,
      duration: this.formatDuration(startedAt, finishedAt),
      status: 'done',
    });
    this.gateway.emitLog(
      'success',
      `Job "${jobName}" selesai (${doneItems} item, ${this.formatDuration(startedAt, finishedAt)})`,
    );
  }

  private async markError(jobName: SeedJobName, errorMsg: string): Promise<void> {
    await this.prisma.seedLog
      .update({
        where: { jobName },
        data: { status: 'error', errorMsg, finishedAt: new Date() },
      })
      .catch(() => undefined);
    this.logger.error(`Job "${jobName}" gagal: ${errorMsg}`);
  }

  /** Persist progress and emit a WebSocket progress event. */
  private async tick(
    job: SeedJobName,
    current: number,
    total: number,
    startedAt: Date,
    currentItem: string,
  ): Promise<void> {
    await this.prisma.seedLog
      .update({ where: { jobName: job }, data: { doneItems: current } })
      .catch(() => undefined);

    const percent = total > 0 ? Math.round((current / total) * 10000) / 100 : 0;
    this.gateway.emitProgress({
      job,
      current,
      total,
      percent,
      currentItem,
      status: 'running',
      startedAt: startedAt.toISOString(),
      estimatedDone: this.estimateDone(startedAt, current, total),
    });
  }

  private estimateDone(
    startedAt: Date,
    current: number,
    total: number,
  ): string | undefined {
    if (current <= 0 || current >= total) return undefined;
    const elapsed = Date.now() - startedAt.getTime();
    const perItem = elapsed / current;
    const remaining = (total - current) * perItem;
    return new Date(Date.now() + remaining).toISOString();
  }

  private formatDuration(start: Date, end: Date): string {
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
}
