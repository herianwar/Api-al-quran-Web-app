import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { EquranService } from '../../common/equran/equran.service';
import { EquranDoaItem } from '../../common/equran/equran.types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AudioCacheService } from '../audio/audio-cache.service';
import { QARI_LIST } from '../quran/quran.constants';
import { SholatService } from '../sholat/sholat.service';
import { TAFSIR_SOURCES } from '../tafsir/tafsir.constants';
import { TafsirService } from '../tafsir/tafsir.service';
import { TRANSLATION_SOURCES } from '../translation/translation.constants';
import { TranslationService } from '../translation/translation.service';
import { AiService } from '../ai/ai.service';
import { createHash } from 'crypto';
import { SeedGateway } from './seed.gateway';

export type SeedJobName =
  | 'surah'
  | 'ayat'
  | 'tafsir'
  | 'tafsir_extra'
  | 'doa'
  | 'kota'
  | 'audio'
  | 'translation'
  | 'asbabun_nuzul'
  | 'topic'
  | 'jadwal_sholat'
  | 'hadith'
  | 'asmaul_husna'
  | 'ayat_kata'
  | 'embeddings'
  | 'sajdah'
  | 'niat_shalat'
  | 'bacaan_shalat'
  | 'tahlil'
  | 'adzan';
// Jobs included in "Run All Core" — excludes the lengthy/manual ones
// (audio warm-up, tafsir_extra). startAll iterates this list in order.
const CORE_JOBS: SeedJobName[] = [
  'surah',
  'ayat',
  'tafsir',
  'doa',
  'kota',
  'translation',
  'asbabun_nuzul',
  'topic',
];
// Every job the API exposes status for. getStatus() ensures one row is
// returned per name even before its first run, so the admin UI can render
// every card consistently.
const ALL_JOBS: SeedJobName[] = [
  ...CORE_JOBS,
  'tafsir_extra',
  'jadwal_sholat',
  'hadith',
  'asmaul_husna',
  'ayat_kata',
  'sajdah',
  'niat_shalat',
  'bacaan_shalat',
  'tahlil',
  'adzan',
  'embeddings',
  'audio',
];
const TOTAL_SURAH = 114;
// Marker text used to recognise a cooperative cancellation in markError so the
// job ends as 'cancelled' rather than 'error'. Thrown from tick().
const CANCEL_MARKER = 'Dibatalkan oleh admin';
class SeedCancelledError extends Error {
  constructor() {
    super(CANCEL_MARKER);
    this.name = 'SeedCancelledError';
  }
}
// Path to the bundled doa fallback (read at runtime so it can be replaced
// without rebuilding the image).
const DOA_FALLBACK_PATH = join(__dirname, '..', '..', '..', 'data', 'doa-fallback.json');
const ASMAUL_HUSNA_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'asmaul-husna.json',
);
// Stale lock window — if a row sits as `running` longer than this without
// the process crashing-and-restarting cleanly, treat it as orphaned and let
// the next caller reclaim it.
const STALE_RUNNING_MS = 30 * 60 * 1000;

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);
  // Jobs with a pending cooperative-cancel request. Checked in tick(); the
  // app is single-process so an in-memory set is sufficient.
  private readonly cancelRequested = new Set<SeedJobName>();

  /**
   * On boot, any seed_log still marked 'running' belongs to a previous process
   * that died (single-process app), so it can never finish and would otherwise
   * block new jobs until the 30-min stale window. Mark them as interrupted.
   */
  async onModuleInit(): Promise<void> {
    const res = await this.prisma.seedLog
      .updateMany({
        where: { status: 'running' },
        data: {
          status: 'error',
          errorMsg: 'Terhenti karena server restart',
          finishedAt: new Date(),
        },
      })
      .catch(() => ({ count: 0 }));
    if (res.count > 0) {
      this.logger.warn(
        `Reset ${res.count} seed job 'running' yang orphaned saat startup`,
      );
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly equran: EquranService,
    private readonly redis: RedisService,
    private readonly gateway: SeedGateway,
    private readonly audioCache: AudioCacheService,
    private readonly translation: TranslationService,
    private readonly tafsir: TafsirService,
    private readonly sholat: SholatService,
    private readonly ai: AiService,
  ) {}

  // ─── Public triggers (fire-and-forget) ──────────────────────────────

  async startAll(): Promise<{ started: boolean; jobs: SeedJobName[] }> {
    const busy = await this.findRunningJob();
    if (busy) {
      throw new ConflictException({
        message: `Proses seeding "${busy}" sedang berjalan`,
        error: 'CONFLICT',
      });
    }
    void this.runAll();
    return { started: true, jobs: CORE_JOBS };
  }

  async startJob(job: SeedJobName): Promise<{ started: boolean; job: SeedJobName }> {
    const busy = await this.findRunningJob();
    if (busy) {
      throw new ConflictException({
        message: `Seeding job "${busy}" sedang berjalan`,
        error: 'CONFLICT',
      });
    }
    void this.runJob(job);
    return { started: true, job };
  }

  /**
   * Request cooperative cancellation. With no job, cancels whatever is
   * currently running. The job stops at its next tick() and ends as
   * 'cancelled'. Short jobs may finish before the flag is observed.
   */
  async cancel(
    job?: SeedJobName,
  ): Promise<{ cancelled: SeedJobName[] }> {
    let targets: SeedJobName[];
    if (job) {
      targets = [job];
    } else {
      const running = await this.prisma.seedLog.findMany({
        where: { status: 'running' },
        select: { jobName: true },
      });
      targets = running.map((r) => r.jobName as SeedJobName);
    }
    for (const t of targets) {
      this.cancelRequested.add(t);
      this.gateway.emitLog('warn', `Pembatalan diminta untuk job "${t}"…`);
    }
    return { cancelled: targets };
  }

  private async runAll(): Promise<void> {
    for (const job of CORE_JOBS) {
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
      case 'kota':
        return this.seedKota();
      case 'audio':
        return this.warmAudio();
      case 'translation':
        return this.seedTranslations();
      case 'asbabun_nuzul':
        return this.seedAsbabunNuzul();
      case 'topic':
        return this.seedTopics();
      case 'tafsir_extra':
        return this.seedTafsirExtra();
      case 'jadwal_sholat':
        return this.warmJadwalSholat();
      case 'hadith':
        return this.seedHadith();
      case 'asmaul_husna':
        return this.seedAsmaulHusna();
      case 'ayat_kata':
        return this.seedAyatKata();
      case 'embeddings':
        return this.seedEmbeddings();
      case 'sajdah':
        return this.seedSajdah();
      case 'niat_shalat':
        return this.seedNiatShalat();
      case 'bacaan_shalat':
        return this.seedBacaanShalat();
      case 'tahlil':
        return this.seedTahlil();
      case 'adzan':
        return this.seedAdzan();
    }
  }

  /**
   * Returns the name of any seed job currently `running` in the DB, ignoring
   * rows older than STALE_RUNNING_MS (treated as crashed/orphaned). This is
   * the source of truth across replicas — no in-memory state needed.
   */
  private async findRunningJob(): Promise<string | null> {
    const threshold = new Date(Date.now() - STALE_RUNNING_MS);
    const row = await this.prisma.seedLog.findFirst({
      where: {
        status: 'running',
        startedAt: { gte: threshold },
      },
      select: { jobName: true },
    });
    return row?.jobName ?? null;
  }

  /**
   * Atomically claim a seed_log row for `job` by transitioning it to
   * `running`. Returns `{ resumeFrom }` on success — `null` if another
   * process already holds the row (race). Uses `INSERT ... ON CONFLICT DO
   * UPDATE` with a `WHERE status <> 'running' OR startedAt < threshold`
   * guard so two replicas can never both win.
   *
   * **Resume-on-failure:** when the prior row ended in `error` or
   * `cancelled` with partial progress, we keep `doneItems` as the resume
   * offset so the seed function can skip already-processed items. All
   * seed writes are upserts so re-processing the boundary item is safe.
   */
  private async tryClaim(
    job: SeedJobName,
    totalItems: number,
  ): Promise<{ resumeFrom: number } | null> {
    // Detect resume eligibility BEFORE the claim race.
    const prior = await this.prisma.seedLog.findUnique({
      where: { jobName: job },
    });
    const canResume =
      !!prior &&
      (prior.status === 'error' || prior.status === 'cancelled') &&
      prior.doneItems > 0 &&
      (totalItems === 0 || prior.doneItems < totalItems);
    const resumeFrom = canResume ? prior!.doneItems : 0;
    // Some jobs claim with totalItems=0 (list size known only after fetch);
    // keep the prior total in that case so the progress bar isn't reset to 0.
    const initialTotal = totalItems > 0 ? totalItems : (prior?.totalItems ?? 0);

    // Drop any stale cancel request so a fresh run isn't aborted immediately.
    this.cancelRequested.delete(job);
    const threshold = new Date(Date.now() - STALE_RUNNING_MS);
    const affected = await this.prisma.$executeRaw`
      INSERT INTO "seed_logs"
        ("jobName", "status", "totalItems", "doneItems", "createdAt", "updatedAt", "startedAt", "errorMsg", "finishedAt")
      VALUES
        (${job}, 'running', ${initialTotal}, ${resumeFrom}, NOW(), NOW(), NOW(), NULL, NULL)
      ON CONFLICT ("jobName") DO UPDATE
        SET "status" = 'running',
            "totalItems" = ${initialTotal},
            "doneItems" = ${resumeFrom},
            "startedAt" = NOW(),
            "updatedAt" = NOW(),
            "errorMsg" = NULL,
            "finishedAt" = NULL
        WHERE "seed_logs"."status" <> 'running'
           OR "seed_logs"."startedAt" < ${threshold}
    `;
    if (affected !== 1) return null;
    if (resumeFrom > 0) {
      this.gateway.emitLog(
        'info',
        `Melanjutkan "${job}" dari item ${resumeFrom + 1}${
          initialTotal > 0 ? `/${initialTotal}` : ''
        } (item sebelumnya tetap di DB, upsert mencegah duplikat).`,
      );
    }
    // Push the running state immediately so any client connected at this
    // moment sees it without waiting for the first tick() (which can be
    // seconds away while the seed function fetches its first batch).
    const percent =
      initialTotal > 0
        ? Math.round((resumeFrom / initialTotal) * 10000) / 100
        : 0;
    this.gateway.emitProgress({
      job,
      current: resumeFrom,
      total: initialTotal,
      percent,
      currentItem: 'Memulai…',
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    return { resumeFrom };
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
    const busy = await this.findRunningJob();
    if (busy) {
      throw new ConflictException({
        message: `Tidak bisa reset, seeding "${busy}" sedang berjalan`,
        error: 'CONFLICT',
      });
    }
    // Order matters because of FK constraints.
    await this.prisma.topicAyat.deleteMany();
    await this.prisma.topic.deleteMany();
    await this.prisma.translation.deleteMany();
    await this.prisma.asbabunNuzul.deleteMany();
    await this.prisma.tafsirAyat.deleteMany();
    await this.prisma.tafsir.deleteMany();
    await this.prisma.ayat.deleteMany();
    await this.prisma.surah.deleteMany();
    await this.prisma.doa.deleteMany();
    await this.prisma.kota.deleteMany();
    await this.prisma.seedLog.deleteMany();
    await this.redis.delByPattern('surah:*');
    await this.redis.delByPattern('ayat:*');
    await this.redis.delByPattern('tafsir:*');
    await this.redis.delByPattern('juz:*');
    await this.redis.delByPattern('halaman:*');
    await this.redis.del('doa:all');
    await this.redis.delByPattern('doa:*');
    await this.redis.delByPattern('provinsi:*');
    await this.redis.delByPattern('kota:*');
    this.gateway.emitLog('warn', 'Semua data Quran/tafsir/doa/kota telah direset');
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
    const claim = await this.tryClaim(job, TOTAL_SURAH);
    if (!claim) {
      this.logger.warn(`Skip seedSurah: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog('info', 'Mulai seeding daftar surat...');

      const list = await this.equran.getSuratList();
      let done = claim.resumeFrom;
      for (let i = claim.resumeFrom; i < list.length; i++) {
        const s = list[i];
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
        await this.tick(job, done, list.length, startedAt, `${s.namaLatin} (${s.nomor})`, claim.resumeFrom);
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
    }
  }

  // ─── Seed: Ayat ─────────────────────────────────────────────────────

  async seedAyat(): Promise<void> {
    const job: SeedJobName = 'ayat';
    const claim = await this.tryClaim(job, TOTAL_SURAH);
    if (!claim) {
      this.logger.warn(`Skip seedAyat: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    let totalAyat = 0;
    try {
      this.gateway.emitLog('info', 'Mulai seeding ayat + audio...');

      for (let nomor = claim.resumeFrom + 1; nomor <= TOTAL_SURAH; nomor++) {
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
          const tajwidMap = await this.equran.getAyatTajweed(surah.nomor);

          for (const a of detail.ayat) {
            const meta = pageByAyat.get(a.nomorAyat);
            const tajwid = tajwidMap.get(a.nomorAyat) ?? null;
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
                teksArabTajwid: tajwid,
                teksLatin: a.teksLatin,
                teksIndonesia: a.teksIndonesia,
                audioUrls: (a.audio ?? {}) as Prisma.InputJsonValue,
                juz: meta?.juz ?? null,
                halaman: meta?.page ?? null,
              },
              update: {
                teksArab: a.teksArab,
                teksArabTajwid: tajwid,
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
            claim.resumeFrom,
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
      await this.redis.del('quran:dump:full');
      await this.markDone(job, totalAyat, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    }
  }

  // ─── Seed: Tafsir ───────────────────────────────────────────────────

  async seedTafsir(): Promise<void> {
    const job: SeedJobName = 'tafsir';
    const claim = await this.tryClaim(job, TOTAL_SURAH);
    if (!claim) {
      this.logger.warn(`Skip seedTafsir: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    let totalEntries = 0;
    try {
      this.gateway.emitLog('info', 'Mulai seeding tafsir Kemenag...');

      for (let nomor = claim.resumeFrom + 1; nomor <= TOTAL_SURAH; nomor++) {
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
            claim.resumeFrom,
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
      await this.redis.del('quran:dump:full');
      await this.markDone(job, totalEntries, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    }
  }

  // ─── Seed: Doa ──────────────────────────────────────────────────────

  async seedDoa(): Promise<void> {
    const job: SeedJobName = 'doa';
    // Provisional claim with totalItems=0; we update once we know list size.
    const claim = await this.tryClaim(job, 0);
    if (!claim) {
      this.logger.warn(`Skip seedDoa: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog('info', 'Mulai seeding doa & dzikir...');
      let list: EquranDoaItem[];
      let source: 'equran' | 'fallback' = 'equran';
      try {
        list = await this.equran.getDoa();
        if (!list || list.length === 0) {
          throw new Error('equran.id mengembalikan list doa kosong');
        }
      } catch (err) {
        this.logger.warn(
          `equran.id /doa tidak tersedia (${(err as Error).message}); gunakan fallback statis.`,
        );
        this.gateway.emitLog(
          'warn',
          'Sumber online doa gagal; pakai data fallback bundled.',
        );
        list = await this.loadDoaFallback();
        source = 'fallback';
      }

      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: list.length },
      });

      let done = claim.resumeFrom;
      for (let index = claim.resumeFrom; index < list.length; index++) {
        const item = list[index];
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
        await this.tick(job, done, list.length, startedAt, mapped.judul, claim.resumeFrom);
      }

      await this.redis.del('doa:all');
      await this.redis.delByPattern('doa:*');
      await this.markDone(job, done, startedAt);
      this.gateway.emitLog(
        'success',
        `${done} doa tersimpan (sumber: ${source}).`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'doa',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  /** Read the bundled doa fallback JSON, with graceful empty-list result. */
  private async loadDoaFallback(): Promise<EquranDoaItem[]> {
    try {
      const raw = await fsp.readFile(DOA_FALLBACK_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as EquranDoaItem[]) : [];
    } catch (err) {
      this.logger.warn(
        `Gagal load doa fallback ${DOA_FALLBACK_PATH}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  // ─── Seed: Kota ─────────────────────────────────────────────────────

  async seedKota(): Promise<void> {
    const job: SeedJobName = 'kota';
    const claim = await this.tryClaim(job, 0);
    if (!claim) {
      this.logger.warn(`Skip seedKota: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog('info', 'Mulai seeding daftar kota...');
      const raw = await this.equran.getKotaListRaw();
      const root = (raw ?? {}) as Record<string, unknown>;
      const arr = (root.data ?? root) as unknown;
      const items = Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: items.length },
      });
      let done = claim.resumeFrom;
      let failed = 0;
      for (let i = claim.resumeFrom; i < items.length; i++) {
        const it = items[i];
        const id = String(it.id ?? it.kode ?? '');
        if (!id) {
          failed++;
          continue;
        }
        const nama = String(it.lokasi ?? it.nama ?? id);
        const provinsi = String(it.daerah ?? it.provinsi ?? 'Lainnya');
        try {
          await this.prisma.kota.upsert({
            where: { id },
            create: { id, nama, provinsi },
            update: { nama, provinsi },
          });
          done++;
        } catch (err) {
          failed++;
          if (failed <= 3) {
            this.logger.warn(
              `Gagal upsert kota ${id}: ${(err as Error).message}`,
            );
          }
        }
        if (done % 25 === 0) {
          await this.tick(job, done, items.length, startedAt, nama, claim.resumeFrom);
        }
      }
      await this.redis.delByPattern('provinsi:*');
      await this.redis.delByPattern('kota:*');
      await this.markDone(job, done, startedAt);
      if (failed > 0) {
        this.gateway.emitLog(
          'warn',
          `${failed} entri kota gagal di-upsert (lihat log).`,
        );
      }
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'daftar kota',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  // ─── Jadwal sholat warm-up ──────────────────────────────────────────

  /**
   * Pre-fetch jadwal sholat for every kota × the next N months and store in
   * the DB so /sholat/jadwal serves entirely from local data without hitting
   * myquran.com at runtime. Idempotent: months with all 28+ entries already
   * cached are skipped (no external call).
   */
  async warmJadwalSholat(): Promise<void> {
    const job: SeedJobName = 'jadwal_sholat';
    const MONTHS_AHEAD = 12;
    const kotaList = await this.prisma.kota.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, nama: true },
    });
    if (kotaList.length === 0) {
      this.gateway.emitLog(
        'warn',
        'Belum ada kota di DB. Jalankan seed kota dulu sebelum warm jadwal sholat.',
      );
      return;
    }
    const now = new Date();
    const periods: { bulan: number; tahun: number }[] = [];
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      periods.push({ bulan: d.getMonth() + 1, tahun: d.getFullYear() });
    }
    const total = kotaList.length * periods.length;
    const claim = await this.tryClaim(job, total);
    if (!claim) {
      this.logger.warn(`Skip warmJadwalSholat: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog(
        'info',
        `Mulai warm jadwal sholat: ${kotaList.length.toLocaleString('id-ID')} kota × ${MONTHS_AHEAD} bulan = ${total.toLocaleString('id-ID')} entri.`,
      );

      let done = 0;
      let failed = 0;
      let cached = 0;
      let fetched = 0;
      const tickEvery = 10;

      for (const kota of kotaList) {
        for (const p of periods) {
          done++;
          const monthStart = new Date(Date.UTC(p.tahun, p.bulan - 1, 1));
          const monthEnd = new Date(Date.UTC(p.tahun, p.bulan, 1));
          // 28 covers Feb non-leap; smaller counts mean an earlier fetch was
          // partial, so re-fetch the whole month.
          const existing = await this.prisma.jadwalSholat.count({
            where: { kotaId: kota.id, tanggal: { gte: monthStart, lt: monthEnd } },
          });
          if (existing >= 28) {
            cached++;
          } else {
            try {
              const rows = await this.sholat.fetchAndStoreMonth(
                kota.id,
                p.bulan,
                p.tahun,
              );
              if (rows.length === 0) failed++;
              else fetched++;
            } catch (err) {
              failed++;
              if (failed <= 5) {
                this.logger.warn(
                  `Warm jadwal ${kota.id} ${p.bulan}/${p.tahun}: ${(err as Error).message}`,
                );
              }
            }
          }
          if (done % tickEvery === 0) {
            await this.tick(
              job,
              done,
              total,
              startedAt,
              `${kota.nama} ${p.bulan}/${p.tahun}`,
            );
          }
        }
      }

      await this.markDone(job, done - failed, startedAt);
      this.gateway.emitLog(
        failed === 0 ? 'success' : 'warn',
        `Jadwal sholat warm-up selesai: ${fetched.toLocaleString('id-ID')} di-fetch, ${cached.toLocaleString('id-ID')} sudah ada, ${failed} gagal.`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'jadwal sholat warm-up',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  // ─── Hadis (Indonesian translations) ────────────────────────────────

  /**
   * Pre-fetch every perawi's hadis JSON from the renomureza/hadis-api-id
   * GitHub repo (MIT-licensed) and upsert into our DB. Once complete the API
   * serves hadis entirely from local DB — the upstream API/repo can vanish
   * without impact.
   *
   * Source: https://github.com/renomureza/hadis-api-id (data from tafsirq.com).
   * Total: ~38k hadis across 9 perawi.
   */
  async seedHadith(): Promise<void> {
    const job: SeedJobName = 'hadith';
    const RAW_BASE =
      'https://raw.githubusercontent.com/renomureza/hadis-api-id/main/src/data';
    // Fetch perawi index first so we know total before claiming.
    let perawiList: { name: string; slug: string; total: number }[];
    try {
      const res = await axios.get<typeof perawiList>(`${RAW_BASE}/list.json`, {
        timeout: 30_000,
      });
      perawiList = res.data;
    } catch (err) {
      this.gateway.emitLog(
        'error',
        `Gagal ambil list perawi: ${(err as Error).message}`,
      );
      return;
    }
    if (!Array.isArray(perawiList) || perawiList.length === 0) {
      this.gateway.emitLog('error', 'list.json kosong/invalid.');
      return;
    }
    const total = perawiList.reduce((s, p) => s + p.total, 0);
    const claim = await this.tryClaim(job, total);
    if (!claim) {
      this.logger.warn(`Skip seedHadith: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog(
        'info',
        `Mulai seed hadis: ${perawiList.length} perawi, ${total.toLocaleString('id-ID')} hadis dari renomureza/hadis-api-id.`,
      );

      // Upsert all 9 perawi rows first so FK is satisfied during hadis upsert.
      for (const p of perawiList) {
        await this.prisma.perawi.upsert({
          where: { slug: p.slug },
          create: { slug: p.slug, nama: p.name, total: p.total },
          update: { nama: p.name, total: p.total },
        });
      }

      let done = claim.resumeFrom;
      let failed = 0;
      const tickEvery = 100;

      for (const p of perawiList) {
        // Skip whole perawi if its hadis are already fully loaded — fast resume
        // path when re-running after partial failure.
        const existingCount = await this.prisma.hadis.count({
          where: { perawiSlug: p.slug },
        });
        if (existingCount >= p.total) {
          done += p.total - existingCount; // already counted; effectively skip
          this.gateway.emitLog(
            'info',
            `Skip "${p.name}": ${existingCount}/${p.total} sudah lengkap.`,
          );
          done += p.total; // advance progress counter
          await this.tick(job, done, total, startedAt, `Skip ${p.name}`);
          continue;
        }

        let items: { number: number; arab: string; id: string }[];
        try {
          const res = await axios.get<typeof items>(`${RAW_BASE}/${p.slug}.json`, {
            timeout: 60_000,
          });
          items = res.data;
        } catch (err) {
          this.gateway.emitLog(
            'error',
            `Gagal ambil ${p.slug}.json: ${(err as Error).message}`,
          );
          failed += p.total;
          done += p.total;
          await this.tick(job, done, total, startedAt, p.name, claim.resumeFrom);
          continue;
        }
        if (!Array.isArray(items)) {
          this.gateway.emitLog('error', `${p.slug}.json bukan array, skip.`);
          failed += p.total;
          done += p.total;
          continue;
        }

        // Batch upserts in chunks of 200 to keep memory + tx size reasonable.
        const CHUNK = 200;
        for (let i = 0; i < items.length; i += CHUNK) {
          const batch = items.slice(i, i + CHUNK);
          await this.prisma.$transaction(
            batch.map((h) =>
              this.prisma.hadis.upsert({
                where: {
                  perawiSlug_nomor: { perawiSlug: p.slug, nomor: h.number },
                },
                create: {
                  perawiSlug: p.slug,
                  nomor: h.number,
                  arab: h.arab ?? '',
                  terjemahan: h.id ?? '',
                },
                update: {
                  arab: h.arab ?? '',
                  terjemahan: h.id ?? '',
                },
              }),
            ),
          );
          done += batch.length;
          if (done % tickEvery < CHUNK) {
            await this.tick(
              job,
              done,
              total,
              startedAt,
              `${p.name} #${batch[batch.length - 1]?.number ?? ''}`,
              claim.resumeFrom,
            );
          }
        }
        this.gateway.emitLog(
          'success',
          `Perawi "${p.name}": ${items.length.toLocaleString('id-ID')} hadis tersimpan.`,
        );
      }

      await this.markDone(job, done - failed, startedAt);
      this.gateway.emitLog(
        failed === 0 ? 'success' : 'warn',
        `Seed hadis selesai: ${(done - failed).toLocaleString('id-ID')} tersimpan, ${failed} gagal.`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'hadith seed',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  // ─── Asmaul Husna ───────────────────────────────────────────────────

  /**
   * Load the bundled 99 Asmaul Husna JSON and upsert each row by id. Static
   * data — no external API call, idempotent. Total runtime: <1s.
   */
  async seedAsmaulHusna(): Promise<void> {
    const job: SeedJobName = 'asmaul_husna';
    let items: { id: number; arab: string; latin: string; arti: string }[];
    try {
      const raw = await fsp.readFile(ASMAUL_HUSNA_PATH, 'utf-8');
      items = JSON.parse(raw);
    } catch (err) {
      this.gateway.emitLog(
        'error',
        `Gagal baca asmaul-husna.json: ${(err as Error).message}`,
      );
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      this.gateway.emitLog('error', 'asmaul-husna.json kosong/invalid');
      return;
    }
    const claim = await this.tryClaim(job, items.length);
    if (!claim) {
      this.logger.warn(`Skip seedAsmaulHusna: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog(
        'info',
        `Mulai seed Asmaul Husna: ${items.length} nama.`,
      );
      let done = claim.resumeFrom;
      for (let i = claim.resumeFrom; i < items.length; i++) {
        const item = items[i];
        await this.prisma.asmaulHusna.upsert({
          where: { id: item.id },
          create: item,
          update: { arab: item.arab, latin: item.latin, arti: item.arti },
        });
        done++;
        if (done % 25 === 0 || done === items.length) {
          await this.tick(
            job,
            done,
            items.length,
            startedAt,
            item.latin,
            claim.resumeFrom,
          );
        }
      }
      await this.markDone(job, done, startedAt);
      this.gateway.emitLog(
        'success',
        `${done} Asmaul Husna tersimpan.`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'asmaul-husna',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  // ─── Audio cache warm-up ────────────────────────────────────────────

  /**
   * Pre-download every (qari, surah-full + per-ayat) audio file to the local
   * cache directory. After this finishes the API serves audio entirely from
   * disk; the equran CDN can vanish without impact.
   *
   * This is a long-running operation (37k+ ayat × 6 qari = ~225k files
   * totalling ~2GB). Progress is emitted via the seed WebSocket as usual.
   */
  async warmAudio(): Promise<void> {
    const job: SeedJobName = 'audio';
    // Estimate total work: surah-full (114 × N qari) + per-ayat (total ayat × N qari).
    const ayatCount = await this.prisma.ayat.count();
    if (ayatCount === 0) {
      this.gateway.emitLog(
        'warn',
        'Belum ada ayat di DB. Jalankan seed surah+ayat dulu sebelum warm audio.',
      );
      return;
    }
    const qariIds = QARI_LIST.map((q) => q.id);
    const total = (TOTAL_SURAH + ayatCount) * qariIds.length;
    // Resume relies on the cache's on-disk fast-path (statSafe → cached:true),
    // not a counter — so a re-run actually retries files that earlier failed
    // mid-batch (ENOSPC, network, etc.) instead of skipping them by index.
    const claim = await this.tryClaim(job, total);
    if (!claim) {
      this.logger.warn(`Skip warmAudio: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog(
        'info',
        `Mulai warm audio cache: ${total.toLocaleString()} file (${qariIds.length} qari × ${TOTAL_SURAH} surah-full + ${ayatCount.toLocaleString()} ayat).`,
      );

      let done = 0;
      let failed = 0;
      let cached = 0;
      let fetched = 0;
      const tickEvery = 25;

      const isDiskFull = (msg: string) =>
        msg.includes('ENOSPC') || /no space left/i.test(msg);

      // Full-surah audio first (smaller set, fast win).
      for (const qariId of qariIds) {
        for (let nomor = 1; nomor <= TOTAL_SURAH; nomor++) {
          done++;
          try {
            const result = await this.audioCache.getSurah(qariId, nomor);
            if (result.cached) cached++;
            else fetched++;
          } catch (err) {
            const msg = (err as Error).message;
            if (isDiskFull(msg)) {
              throw new Error(
                `Disk penuh saat download audio (surah ${nomor} qari ${qariId}). ` +
                  `Bebaskan ruang minimal ~20 GB lalu jalankan ulang — file yang sudah ada di-skip.`,
              );
            }
            failed++;
            if (failed <= 5) {
              this.logger.warn(
                `Warm surah ${nomor} qari ${qariId}: ${msg}`,
              );
            }
          }
          if (done % tickEvery === 0) {
            await this.tick(
              job,
              done,
              total,
              startedAt,
              `surah ${nomor} / qari ${qariId}`,
            );
          }
        }
      }

      // Per-ayat audio.
      const surahs = await this.prisma.surah.findMany({
        select: { nomor: true, jumlahAyat: true },
        orderBy: { nomor: 'asc' },
      });
      for (const qariId of qariIds) {
        for (const s of surahs) {
          for (let ayat = 1; ayat <= s.jumlahAyat; ayat++) {
            done++;
            try {
              const result = await this.audioCache.getAyat(qariId, s.nomor, ayat);
              if (result.cached) cached++;
              else fetched++;
            } catch (err) {
              const msg = (err as Error).message;
              if (isDiskFull(msg)) {
                throw new Error(
                  `Disk penuh saat download audio (${s.nomor}:${ayat} qari ${qariId}). ` +
                    `Bebaskan ruang minimal ~20 GB lalu jalankan ulang — file yang sudah ada di-skip.`,
                );
              }
              failed++;
              if (failed <= 5) {
                this.logger.warn(
                  `Warm ${s.nomor}:${ayat} qari ${qariId}: ${msg}`,
                );
              }
            }
            if (done % tickEvery === 0) {
              await this.tick(
                job,
                done,
                total,
                startedAt,
                `${s.nomor}:${ayat} / qari ${qariId}`,
              );
            }
          }
        }
      }

      await this.markDone(job, done - failed, startedAt);
      this.gateway.emitLog(
        failed === 0 ? 'success' : 'warn',
        `Audio warm-up selesai: ${fetched.toLocaleString()} di-download, ${cached.toLocaleString()} sudah cache, ${failed} gagal.`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'audio warm-up',
        error: (error as Error).message,
        retrying: false,
      });
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

  // ─── Seed: Translations (multi-source via quran.com) ────────────────

  async seedTranslations(): Promise<void> {
    const job: SeedJobName = 'translation';
    const total = TRANSLATION_SOURCES.length;
    const claim = await this.tryClaim(job, total);
    if (!claim) {
      this.logger.warn(`Skip seedTranslations: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    let done = claim.resumeFrom;
    try {
      this.gateway.emitLog(
        'info',
        `Mulai seeding ${total} sumber terjemahan dari quran.com...`,
      );
      for (let i = claim.resumeFrom; i < TRANSLATION_SOURCES.length; i++) {
        const src = TRANSLATION_SOURCES[i];
        try {
          const result = await this.translation.fetchAndStoreSource(src);
          this.gateway.emitLog(
            'success',
            `Terjemahan "${result.sumber}": ${result.upserted} ayat`,
          );
        } catch (err) {
          this.gateway.emitError({
            job,
            failedItem: src.sumber,
            error: (err as Error).message,
            retrying: false,
          });
          this.logger.warn(
            `Gagal seed terjemahan ${src.sumber}: ${(err as Error).message}`,
          );
        }
        done++;
        await this.tick(job, done, total, startedAt, src.sumber, claim.resumeFrom);
      }
      await this.markDone(job, done, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    }
  }

  // ─── Seed: Asbabun Nuzul (from bundled static JSON) ─────────────────

  async seedAsbabunNuzul(): Promise<void> {
    const job: SeedJobName = 'asbabun_nuzul';
    const claim = await this.tryClaim(job, 0);
    if (!claim) {
      this.logger.warn(
        `Skip seedAsbabunNuzul: another worker holds the lock.`,
      );
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog('info', 'Mulai seeding asbabun nuzul (static)...');
      const path = join(
        __dirname,
        '..',
        '..',
        '..',
        'data',
        'asbabun-nuzul.json',
      );
      let entries: Array<{
        surah: number;
        ayat: number;
        teks: string;
        sumber?: string | null;
      }> = [];
      try {
        const raw = await fsp.readFile(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) entries = parsed;
      } catch (err) {
        this.logger.warn(
          `data/asbabun-nuzul.json tidak terbaca: ${(err as Error).message}`,
        );
      }
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: entries.length },
      });

      // Resolve verseKey → ayatId once.
      const ayatRows = await this.prisma.ayat.findMany({
        select: {
          id: true,
          nomorAyat: true,
          surah: { select: { nomor: true } },
        },
      });
      const ayatIdByKey = new Map<string, number>();
      for (const a of ayatRows) {
        ayatIdByKey.set(`${a.surah.nomor}:${a.nomorAyat}`, a.id);
      }

      let done = claim.resumeFrom;
      let skipped = 0;
      for (let idx = claim.resumeFrom; idx < entries.length; idx++) {
        const e = entries[idx];
        const ayatId = ayatIdByKey.get(`${e.surah}:${e.ayat}`);
        if (!ayatId) {
          skipped++;
          continue;
        }
        const sumber = e.sumber ?? 'Asbabun Nuzul (curated)';
        await this.prisma.asbabunNuzul.upsert({
          where: { ayatId_sumber: { ayatId, sumber } },
          create: { ayatId, teks: e.teks, sumber },
          update: { teks: e.teks },
        });
        done++;
        if (done % 10 === 0) {
          await this.tick(
            job,
            done,
            entries.length,
            startedAt,
            `${e.surah}:${e.ayat}`,
            claim.resumeFrom,
          );
        }
      }
      await this.markDone(job, done, startedAt);
      if (skipped > 0) {
        this.gateway.emitLog(
          'warn',
          `${skipped} asbabun nuzul entry dilewati (ayat tidak ditemukan di DB).`,
        );
      }
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'asbabun nuzul',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  // ─── Seed: Topics ────────────────────────────────────────────────────

  async seedTopics(): Promise<void> {
    const job: SeedJobName = 'topic';
    const claim = await this.tryClaim(job, 0);
    if (!claim) {
      this.logger.warn(`Skip seedTopics: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog('info', 'Mulai seeding topic...');
      const path = join(__dirname, '..', '..', '..', 'data', 'topics.json');
      let entries: Array<{
        slug: string;
        nama: string;
        urutan?: number;
        deskripsi?: string;
        ayat: Array<{ s: number; a: number; catatan?: string }>;
      }> = [];
      try {
        const raw = await fsp.readFile(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) entries = parsed;
      } catch (err) {
        this.logger.warn(
          `data/topics.json tidak terbaca: ${(err as Error).message}`,
        );
      }
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: entries.length },
      });

      // Resolve verseKey → ayatId once for the whole seed.
      const ayatRows = await this.prisma.ayat.findMany({
        select: {
          id: true,
          nomorAyat: true,
          surah: { select: { nomor: true } },
        },
      });
      const ayatIdByKey = new Map<string, number>();
      for (const a of ayatRows) {
        ayatIdByKey.set(`${a.surah.nomor}:${a.nomorAyat}`, a.id);
      }

      let done = claim.resumeFrom;
      let totalLinks = 0;
      for (let idx = claim.resumeFrom; idx < entries.length; idx++) {
        const t = entries[idx];
        const topic = await this.prisma.topic.upsert({
          where: { slug: t.slug },
          create: {
            slug: t.slug,
            nama: t.nama,
            urutan: t.urutan ?? 100,
            deskripsi: t.deskripsi ?? null,
          },
          update: {
            nama: t.nama,
            urutan: t.urutan ?? 100,
            deskripsi: t.deskripsi ?? null,
          },
        });
        // Replace ayat links idempotently: delete all then re-create. The
        // dataset size (~few hundred per topic max) makes this cheap.
        await this.prisma.topicAyat.deleteMany({
          where: { topicId: topic.id },
        });
        for (const link of t.ayat) {
          const ayatId = ayatIdByKey.get(`${link.s}:${link.a}`);
          if (!ayatId) continue;
          await this.prisma.topicAyat.create({
            data: {
              topicId: topic.id,
              ayatId,
              catatan: link.catatan ?? null,
            },
          });
          totalLinks++;
        }
        done++;
        await this.tick(job, done, entries.length, startedAt, t.nama, claim.resumeFrom);
      }
      await this.redis.del('topic:list');
      await this.markDone(job, done, startedAt);
      this.gateway.emitLog(
        'success',
        `${done} topik, ${totalLinks} mapping ayat tersimpan.`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'topic',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  // ─── Seed: Tafsir extra sources (Jalalain, Ibn Katsir, dll) ─────────

  /**
   * Seed every tafsir source registered in TAFSIR_SOURCES that has a
   * quranComId. The legacy "kemenag" source is skipped here — it's seeded
   * via the original equran.id-based job.
   */
  async seedTafsirExtra(): Promise<void> {
    const job: SeedJobName = 'tafsir_extra';
    const targets = TAFSIR_SOURCES.filter((s) => s.quranComId !== null);
    const claim = await this.tryClaim(job, targets.length);
    if (!claim) {
      this.logger.warn(`Skip seedTafsirExtra: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog(
        'info',
        `Mulai seed ${targets.length} sumber tafsir tambahan dari quran.com...`,
      );
      let done = claim.resumeFrom;
      for (let i = claim.resumeFrom; i < targets.length; i++) {
        const src = targets[i];
        try {
          const result = await this.tafsir.fetchAndStoreSource(src);
          this.gateway.emitLog(
            'success',
            `Tafsir "${result.sumber}": ${result.upserted} ayat`,
          );
        } catch (err) {
          this.gateway.emitError({
            job,
            failedItem: src.sumber,
            error: (err as Error).message,
            retrying: false,
          });
          this.logger.warn(
            `Gagal seed tafsir ${src.sumber}: ${(err as Error).message}`,
          );
        }
        done++;
        await this.tick(job, done, targets.length, startedAt, src.sumber, claim.resumeFrom);
      }
      await this.redis.delByPattern('tafsir:*');
      await this.redis.del('quran:dump:full');
      await this.markDone(job, done, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    }
  }

  // ─── SeedLog + progress helpers ─────────────────────────────────────
  // `markRunning` was replaced by the atomic `tryClaim` above so the claim
  // and the seed_logs row write happen in a single statement (race-safe
  // across replicas).

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
    const cancelled = errorMsg.startsWith(CANCEL_MARKER);
    await this.prisma.seedLog
      .update({
        where: { jobName },
        data: {
          status: cancelled ? 'cancelled' : 'error',
          errorMsg,
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);
    if (cancelled) {
      this.gateway.emitLog('warn', `Job "${jobName}" dibatalkan.`);
      this.logger.warn(`Job "${jobName}" dibatalkan oleh admin`);
    } else {
      this.logger.error(`Job "${jobName}" gagal: ${errorMsg}`);
    }
  }

  /**
   * Persist progress and emit a WebSocket progress event. `resumeFrom` (when
   * non-zero) makes the ETA estimate the remaining items based on THIS run's
   * pace, not pretending the already-resumed items were processed in this
   * session.
   */
  private async tick(
    job: SeedJobName,
    current: number,
    total: number,
    startedAt: Date,
    currentItem: string,
    resumeFrom = 0,
  ): Promise<void> {
    if (this.cancelRequested.has(job)) {
      this.cancelRequested.delete(job);
      throw new SeedCancelledError();
    }
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
      estimatedDone: this.estimateDone(startedAt, current, total, resumeFrom),
    });
  }

  private estimateDone(
    startedAt: Date,
    current: number,
    total: number,
    resumeFrom = 0,
  ): string | undefined {
    const processedThisRun = current - resumeFrom;
    if (processedThisRun <= 0 || current >= total) return undefined;
    const elapsed = Date.now() - startedAt.getTime();
    const perItem = elapsed / processedThisRun;
    const remaining = (total - current) * perItem;
    return new Date(Date.now() + remaining).toISOString();
  }

  private formatDuration(start: Date, end: Date): string {
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  // ─── Seed: Kata per kata (word-by-word) dari Quran.com ───────────────
  //
  // Sumber: https://api.quran.com/api/v4/verses/by_chapter/{n}?words=true&language=id
  // Tiap ayat punya array `words[]` dengan { text_uthmani, transliteration.text,
  // translation.text }. Kita ambil hanya yang char_type_name === "word"
  // (skip token "end" yang menandai akhir ayat).
  //
  // 114 surat × ~55 ayat avg × ~5 kata avg ≈ 31k+ rows. Replace per-ayat
  // atomik (delete + createMany) supaya seed bisa diulang aman.

  async seedAyatKata(): Promise<void> {
    const job: SeedJobName = 'ayat_kata';
    const claim = await this.tryClaim(job, 0);
    if (!claim) {
      this.logger.warn(`Skip seedAyatKata: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog(
        'info',
        'Mulai seeding kata-perkata dari Quran.com…',
      );

      // Build verseKey → ayatId map once.
      const ayatRows = await this.prisma.ayat.findMany({
        select: {
          id: true,
          nomorAyat: true,
          surah: { select: { nomor: true } },
        },
      });
      const ayatIdByKey = new Map<string, number>();
      for (const a of ayatRows) {
        ayatIdByKey.set(`${a.surah.nomor}:${a.nomorAyat}`, a.id);
      }

      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: TOTAL_SURAH },
      });

      let done = claim.resumeFrom;
      let totalKata = 0;
      let skippedSurat = 0;
      for (let surat = claim.resumeFrom + 1; surat <= TOTAL_SURAH; surat++) {
        const records = await this.fetchAyatKataForSurah(surat);
        if (records.length === 0) {
          skippedSurat++;
          done = surat;
          await this.tick(
            job,
            done,
            TOTAL_SURAH,
            startedAt,
            `surah ${surat} (empty)`,
            claim.resumeFrom,
          );
          continue;
        }

        // Group by verseKey so we can replace per-ayat atomically.
        const byVerse = new Map<
          string,
          {
            posisi: number;
            arab: string;
            transliterasi: string | null;
            arti: string;
          }[]
        >();
        for (const r of records) {
          const arr = byVerse.get(r.verseKey) ?? [];
          arr.push({
            posisi: r.posisi,
            arab: r.arab,
            transliterasi: r.transliterasi,
            arti: r.arti,
          });
          byVerse.set(r.verseKey, arr);
        }

        for (const [verseKey, kata] of byVerse) {
          const ayatId = ayatIdByKey.get(verseKey);
          if (!ayatId) continue;
          await this.prisma.$transaction([
            this.prisma.ayatKata.deleteMany({ where: { ayatId } }),
            this.prisma.ayatKata.createMany({
              data: kata.map((k) => ({ ayatId, ...k })),
            }),
          ]);
          totalKata += kata.length;
        }

        done = surat;
        await this.tick(
          job,
          done,
          TOTAL_SURAH,
          startedAt,
          `Q.S. ${surat} (${byVerse.size} ayat)`,
          claim.resumeFrom,
        );
      }

      await this.markDone(job, done, startedAt);
      this.gateway.emitLog(
        'info',
        `Selesai kata-perkata: ${totalKata.toLocaleString('id-ID')} kata tersimpan, ${skippedSurat} surat di-skip.`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'ayat_kata',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  /**
   * Fetch all words for one surah from Quran.com and return flat rows.
   * Pagination: `per_page=300` covers Al-Baqarah's 286 ayat in one call.
   * Retries up to 3× on network errors.
   */
  private async fetchAyatKataForSurah(surat: number): Promise<
    {
      verseKey: string;
      posisi: number;
      arab: string;
      transliterasi: string | null;
      arti: string;
    }[]
  > {
    const url = `https://api.quran.com/api/v4/verses/by_chapter/${surat}?words=true&language=id&word_fields=text_uthmani,transliteration&per_page=300`;
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data } = await axios.get<{
          verses: {
            verse_key: string;
            words: {
              position: number;
              char_type_name?: string;
              text_uthmani?: string;
              transliteration?: { text?: string };
              translation?: { text?: string };
            }[];
          }[];
        }>(url, { timeout: 30_000 });
        const out: {
          verseKey: string;
          posisi: number;
          arab: string;
          transliterasi: string | null;
          arti: string;
        }[] = [];
        for (const v of data.verses ?? []) {
          // Re-number positions across only "word" tokens (skip "end" markers),
          // matching the convention in /quran/ayat/:id/kata.
          let pos = 0;
          for (const w of v.words ?? []) {
            if ((w.char_type_name ?? 'word') !== 'word') continue;
            const arab = (w.text_uthmani ?? '').trim();
            const arti = (w.translation?.text ?? '').trim();
            if (!arab || !arti) continue;
            pos += 1;
            out.push({
              verseKey: v.verse_key,
              posisi: pos,
              arab,
              transliterasi: w.transliteration?.text?.trim() || null,
              arti,
            });
          }
        }
        return out;
      } catch (e) {
        lastErr = e as Error;
        // Exponential backoff: 500ms, 1.5s, 4.5s.
        await new Promise((r) => setTimeout(r, 500 * 3 ** attempt));
      }
    }
    this.logger.warn(
      `fetchAyatKataForSurah(${surat}) gagal: ${lastErr?.message ?? 'unknown'}`,
    );
    return [];
  }

  // ─── Seed: Embeddings (AI semantic search) ───────────────────────────
  //
  // Embed every ayat using the configured AI provider, store vectors in
  // `ayat_embeddings.embedding` (pgvector). Idempotent — rows with a
  // matching sourceHash are skipped, so a re-run only embeds new/changed
  // rows and crashed-batch recovery is automatic.
  //
  // Batch size 96 keeps each OpenAI call under ~3 KB and well within the
  // 8k token request limit while spreading rate-limit budget evenly.

  async seedEmbeddings(): Promise<void> {
    const job: SeedJobName = 'embeddings';
    const claim = await this.tryClaim(job, 0);
    if (!claim) {
      this.logger.warn(`Skip seedEmbeddings: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog('info', 'Mulai seeding embeddings…');

      const total = await this.prisma.ayat.count();
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: total },
      });

      // Fetch *all* ayat once (id + text). 6.236 rows × ~500 bytes = ~3MB
      // in memory — fine.
      const allAyat = await this.prisma.ayat.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          teksArab: true,
          teksLatin: true,
          teksIndonesia: true,
          surah: { select: { nomor: true, namaLatin: true } },
          nomorAyat: true,
        },
      });

      const existing = await this.prisma.ayatEmbedding.findMany({
        select: { ayatId: true, sourceHash: true, model: true },
      });
      const existingMap = new Map(
        existing.map((e) => [e.ayatId, { hash: e.sourceHash, model: e.model }]),
      );

      const BATCH = 96;
      let done = claim.resumeFrom;
      let skipped = 0;
      let embeddedThisRun = 0;
      let tokensTotal = 0;

      for (let i = claim.resumeFrom; i < allAyat.length; i += BATCH) {
        const slice = allAyat.slice(i, i + BATCH);
        const inputs: { ayatId: number; text: string; hash: string }[] = [];
        for (const a of slice) {
          // Embed Arab + Indonesian translation. Use Q.S.+verseKey as a
          // tiny prefix so the embedding "knows" which ayat — improves
          // ranking for queries that mention a surah name.
          const text =
            `Q.S. ${a.surah.namaLatin} ${a.surah.nomor}:${a.nomorAyat}. ` +
            `${a.teksArab}\n${a.teksIndonesia}`;
          const hash = createHash('sha1').update(text).digest('hex');
          const ex = existingMap.get(a.id);
          if (ex && ex.hash === hash) {
            skipped++;
            continue;
          }
          inputs.push({ ayatId: a.id, text, hash });
        }

        if (inputs.length > 0) {
          const res = await this.ai.embed({
            input: inputs.map((x) => x.text),
          });
          tokensTotal += res.tokensUsed;

          for (let k = 0; k < inputs.length; k++) {
            const { ayatId, hash } = inputs[k];
            const vec = res.vectors[k];
            await this.prisma.ayatEmbedding.upsert({
              where: { ayatId },
              create: {
                ayatId,
                sourceHash: hash,
                model: res.model,
                dim: res.dim,
              },
              update: {
                sourceHash: hash,
                model: res.model,
                dim: res.dim,
              },
            });
            // pgvector literal: `[v1,v2,…]`. Bind as a single text param,
            // cast in SQL — avoids 1536 separate placeholders.
            const literal = `[${vec.join(',')}]`;
            await this.prisma.$executeRawUnsafe(
              `UPDATE ayat_embeddings SET embedding = $1::vector WHERE "ayatId" = $2`,
              literal,
              ayatId,
            );
            embeddedThisRun++;
          }
        }

        done = Math.min(allAyat.length, i + BATCH);
        await this.tick(
          job,
          done,
          allAyat.length,
          startedAt,
          `${done}/${allAyat.length} (skipped ${skipped}, tokens ${tokensTotal.toLocaleString('id-ID')})`,
          claim.resumeFrom,
        );
      }

      await this.markDone(job, done, startedAt);
      this.gateway.emitLog(
        'info',
        `Selesai embeddings: ${embeddedThisRun.toLocaleString('id-ID')} ayat ter-embed (${skipped} skipped), ${tokensTotal.toLocaleString('id-ID')} token total.`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'embeddings',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  // ─── Seed: 15 Sajdah ayat ────────────────────────────────────────────

  async seedSajdah(): Promise<void> {
    const job: SeedJobName = 'sajdah';
    const claim = await this.tryClaim(job, 0);
    if (!claim) {
      this.logger.warn(`Skip seedSajdah: another worker holds the lock.`);
      return;
    }
    const startedAt = new Date();
    try {
      this.gateway.emitLog('info', 'Mulai seeding ayat sajdah…');
      const path = join(__dirname, '..', '..', '..', 'data', 'ayat-sajdah.json');
      const raw = await fsp.readFile(path, 'utf-8');
      const items: { surah: number; ayat: number; jenis: string }[] =
        JSON.parse(raw);
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: items.length },
      });

      // Reset previous sajdah tags so re-runs are clean.
      await this.prisma.ayat.updateMany({
        where: { sajdah: { not: null } },
        data: { sajdah: null },
      });

      let done = 0;
      let skipped = 0;
      for (const it of items) {
        const surah = await this.prisma.surah.findUnique({
          where: { nomor: it.surah },
          select: { id: true },
        });
        if (!surah) {
          skipped++;
          continue;
        }
        const res = await this.prisma.ayat.updateMany({
          where: { surahId: surah.id, nomorAyat: it.ayat },
          data: { sajdah: it.jenis },
        });
        if (res.count === 0) skipped++;
        done++;
        await this.tick(
          job,
          done,
          items.length,
          startedAt,
          `Q.S. ${it.surah}:${it.ayat}`,
        );
      }
      await this.markDone(job, done, startedAt);
      this.gateway.emitLog(
        'info',
        `Selesai sajdah: ${done - skipped} ayat ditag, ${skipped} di-skip.`,
      );
    } catch (error) {
      await this.markError(job, (error as Error).message);
      this.gateway.emitError({
        job,
        failedItem: 'sajdah',
        error: (error as Error).message,
        retrying: false,
      });
    }
  }

  // ─── Seed: Niat Shalat ───────────────────────────────────────────────

  async seedNiatShalat(): Promise<void> {
    const job: SeedJobName = 'niat_shalat';
    const claim = await this.tryClaim(job, 0);
    if (!claim) return;
    const startedAt = new Date();
    try {
      const path = join(__dirname, '..', '..', '..', 'data', 'niat-shalat.json');
      const items: {
        id: string;
        nama: string;
        arab: string;
        latin: string;
        arti: string;
      }[] = JSON.parse(await fsp.readFile(path, 'utf-8'));
      const order: Record<string, number> = {
        niatsubuh: 1,
        niatdzuhur: 2,
        niatashar: 3,
        niatmaghrib: 4,
        niatisya: 5,
      };
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: items.length },
      });
      let done = 0;
      for (const it of items) {
        await this.prisma.niatShalat.upsert({
          where: { slug: it.id },
          update: {
            nama: it.nama,
            arab: it.arab,
            latin: it.latin,
            arti: it.arti,
            urutan: order[it.id] ?? 99,
          },
          create: {
            slug: it.id,
            nama: it.nama,
            arab: it.arab,
            latin: it.latin,
            arti: it.arti,
            urutan: order[it.id] ?? 99,
          },
        });
        done++;
        await this.tick(job, done, items.length, startedAt, it.nama);
      }
      await this.markDone(job, done, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    }
  }

  // ─── Seed: Bacaan Shalat per gerakan ─────────────────────────────────

  async seedBacaanShalat(): Promise<void> {
    const job: SeedJobName = 'bacaan_shalat';
    const claim = await this.tryClaim(job, 0);
    if (!claim) return;
    const startedAt = new Date();
    try {
      const path = join(
        __dirname,
        '..',
        '..',
        '..',
        'data',
        'bacaan-shalat.json',
      );
      type B = { arab: string; latin?: string; arti?: string };
      const groups: {
        id: number | string;
        nama: string;
        bacaan: B | B[];
      }[] = JSON.parse(await fsp.readFile(path, 'utf-8'));
      // Pre-compute total bacaan.
      const total = groups.reduce(
        (acc, g) => acc + (Array.isArray(g.bacaan) ? g.bacaan.length : 1),
        0,
      );
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: total },
      });
      let done = 0;
      let gerakan = 0;
      // Replace all existing rows for a clean rebuild on re-seed.
      await this.prisma.bacaanShalat.deleteMany({});
      for (const g of groups) {
        gerakan += 1;
        const bcn = Array.isArray(g.bacaan) ? g.bacaan : [g.bacaan];
        let varian = 0;
        for (const b of bcn) {
          varian += 1;
          await this.prisma.bacaanShalat.create({
            data: {
              gerakan,
              varian,
              nama: g.nama,
              arab: b.arab ?? '',
              latin: b.latin ?? '',
              arti: b.arti ?? '',
            },
          });
          done++;
          if (done % 5 === 0) {
            await this.tick(job, done, total, startedAt, `${gerakan}: ${g.nama}`);
          }
        }
      }
      await this.markDone(job, done, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    }
  }

  // ─── Seed: Tahlil ────────────────────────────────────────────────────

  async seedTahlil(): Promise<void> {
    const job: SeedJobName = 'tahlil';
    const claim = await this.tryClaim(job, 0);
    if (!claim) return;
    const startedAt = new Date();
    try {
      const path = join(__dirname, '..', '..', '..', 'data', 'tahlil.json');
      const items: {
        no: number;
        judul: string;
        arab: string;
        id?: string;
        latin?: string;
        arti?: string;
      }[] = JSON.parse(await fsp.readFile(path, 'utf-8'));
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: items.length },
      });
      function inferJenis(judul: string): string {
        const j = judul.toLowerCase();
        if (j.includes('pengantar') || (j.includes('al-fatihah') && !j.includes('doa')))
          return 'pembuka';
        if (j.includes('surat al-') || j.includes('ayat kursi')) return 'surat';
        if (j.includes('tahlil') || j.includes('takbir') || j.includes('tasbih'))
          return 'tasbih';
        if (j.includes('shalawat')) return 'shalawat';
        if (j.includes('doa')) return 'doa';
        return 'lain';
      }
      let done = 0;
      for (const it of items) {
        const arti = it.arti ?? it.id ?? '';
        await this.prisma.tahlil.upsert({
          where: { urutan: it.no },
          update: {
            judul: it.judul,
            arab: it.arab,
            latin: it.latin ?? null,
            arti,
            jenis: inferJenis(it.judul),
          },
          create: {
            urutan: it.no,
            judul: it.judul,
            arab: it.arab,
            latin: it.latin ?? null,
            arti,
            jenis: inferJenis(it.judul),
          },
        });
        done++;
        if (done % 5 === 0) {
          await this.tick(job, done, items.length, startedAt, it.judul);
        }
      }
      await this.markDone(job, done, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    }
  }

  // ─── Seed: Adzan (audio panggilan shalat, self-hosted) ───────────────
  // Reads data/adzan.json, ensures each MP3 is present on local disk
  // (downloads from sumberUrl on a fresh machine), then upserts a DB row per
  // slug. Idempotent: existing files are reused, rows are updated in place.

  async seedAdzan(): Promise<void> {
    const job: SeedJobName = 'adzan';
    const claim = await this.tryClaim(job, 0);
    if (!claim) return;
    const startedAt = new Date();
    try {
      const path = join(__dirname, '..', '..', '..', 'data', 'adzan.json');
      const audioDir = join(__dirname, '..', '..', '..', 'data', 'audio-adzan');
      const items: {
        slug: string;
        judul: string;
        muadzin?: string | null;
        lokasi?: string | null;
        jenis?: string;
        file: string;
        durasi?: number | null;
        sumberUrl?: string | null;
      }[] = JSON.parse(await fsp.readFile(path, 'utf-8'));
      await fsp.mkdir(audioDir, { recursive: true });
      await this.prisma.seedLog.update({
        where: { jobName: job },
        data: { totalItems: items.length },
      });
      let done = 0;
      let urutan = 0;
      for (const it of items) {
        urutan += 1;
        const dest = join(audioDir, it.file);
        let size: number | null = null;
        try {
          size = (await fsp.stat(dest)).size;
        } catch {
          // File missing — download from the upstream source if we have one.
          if (it.sumberUrl) {
            const response = await axios.get<ArrayBuffer>(it.sumberUrl, {
              responseType: 'arraybuffer',
              timeout: 60_000,
            });
            await fsp.writeFile(dest, Buffer.from(response.data));
            size = (await fsp.stat(dest)).size;
          }
        }
        await this.prisma.adzan.upsert({
          where: { slug: it.slug },
          update: {
            judul: it.judul,
            muadzin: it.muadzin ?? null,
            lokasi: it.lokasi ?? null,
            jenis: it.jenis ?? 'umum',
            file: it.file,
            durasi: it.durasi ?? null,
            ukuran: size,
            sumberUrl: it.sumberUrl ?? null,
            urutan,
          },
          create: {
            slug: it.slug,
            judul: it.judul,
            muadzin: it.muadzin ?? null,
            lokasi: it.lokasi ?? null,
            jenis: it.jenis ?? 'umum',
            file: it.file,
            durasi: it.durasi ?? null,
            ukuran: size,
            sumberUrl: it.sumberUrl ?? null,
            urutan,
          },
        });
        done++;
        await this.tick(job, done, items.length, startedAt, it.judul);
      }
      await this.markDone(job, done, startedAt);
    } catch (error) {
      await this.markError(job, (error as Error).message);
    }
  }
}
