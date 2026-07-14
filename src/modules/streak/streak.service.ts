import { BadRequestException, Injectable } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { LogSessionDto, UpdateGoalDto, UpsertKhatamDto } from './dto/streak.dto';

/** Total ayat dalam mushaf Al-Qur'an (standar Madinah). */
const TOTAL_AYAT = 6236;

/** YYYY-MM-DD in UTC. Use this when the client doesn't supply a tanggal. */
function todayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Selisih hari inklusif antara dua YYYY-MM-DD (a<=b). */
function inclusiveDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map((s) => parseInt(s, 10));
  const [by, bm, bd] = b.split('-').map((s) => parseInt(s, 10));
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.floor((db - da) / 86_400_000) + 1;
}

/** Move a YYYY-MM-DD back N days. Pure string arithmetic via Date. */
function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent per (userId, tanggal). Multiple calls in a day add to the
   * day's ayatCount but don't create a new row. Call this whenever the
   * user reads an ayat (frontend triggers debounced).
   */
  async logSession(
    userId: string,
    dto: LogSessionDto,
  ): Promise<ResponsePayload<unknown>> {
    const tanggal = dto.tanggal ?? todayUTC();
    const ayatCount = dto.ayatCount ?? 1;
    const row = await this.prisma.readingSession.upsert({
      where: { userId_tanggal: { userId, tanggal } },
      update: { ayatCount: { increment: ayatCount } },
      create: { userId, tanggal, ayatCount },
    });
    return ok(row, 'Reading session tercatat');
  }

  async getStreak(userId: string): Promise<ResponsePayload<unknown>> {
    // Pull the last 400 days max (well beyond any realistic streak) sorted
    // most-recent-first. Then walk backwards from "today" counting
    // consecutive days. Also compute the longest historical streak.
    const sessions = await this.prisma.readingSession.findMany({
      where: { userId },
      orderBy: { tanggal: 'desc' },
      take: 400,
      select: { tanggal: true, ayatCount: true },
    });
    const dates = new Set(sessions.map((s) => s.tanggal));
    const today = todayUTC();

    // Current streak: start from today (or yesterday if today not yet
    // logged — keeps the streak alive until the day actually ends).
    let cursor: string;
    if (dates.has(today)) cursor = today;
    else if (dates.has(shiftDate(today, -1))) cursor = shiftDate(today, -1);
    else cursor = '';
    let current = 0;
    while (cursor && dates.has(cursor)) {
      current += 1;
      cursor = shiftDate(cursor, -1);
    }

    // Longest streak: linear scan of all dates.
    const sortedAsc = [...dates].sort();
    let longest = 0;
    let run = 0;
    let prev = '';
    for (const t of sortedAsc) {
      if (prev && shiftDate(prev, 1) === t) {
        run += 1;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = t;
    }

    const todayAyat =
      sessions.find((s) => s.tanggal === today)?.ayatCount ?? 0;

    return ok(
      {
        current,
        longest,
        todayCount: todayAyat,
        activeToday: dates.has(today),
        last30Days: sessions
          .slice(0, 30)
          .map((s) => ({ tanggal: s.tanggal, ayatCount: s.ayatCount }))
          .reverse(),
      },
      'Reading streak',
    );
  }

  async getGoal(userId: string): Promise<ResponsePayload<unknown>> {
    const goal = await this.prisma.readingGoal.findUnique({
      where: { userId },
    });
    return ok(
      goal ?? { unit: 'ayat', target: 10, default: true },
      goal ? 'Target baca harian' : 'Target default (belum di-set user)',
    );
  }

  async upsertGoal(
    userId: string,
    dto: UpdateGoalDto,
  ): Promise<ResponsePayload<unknown>> {
    const goal = await this.prisma.readingGoal.upsert({
      where: { userId },
      update: { unit: dto.unit, target: dto.target },
      create: { userId, unit: dto.unit, target: dto.target },
    });
    return ok(goal, 'Target harian diperbarui');
  }

  // ─── Khatam plan ──────────────────────────────────────────────────────

  /** Hitung progress khatam dari akumulasi ayat dibaca sejak `mulai`. */
  private async khatamProgress(userId: string, goal: {
    mulai: string;
    targetTanggal: string;
  }) {
    const sessions = await this.prisma.readingSession.findMany({
      where: { userId, tanggal: { gte: goal.mulai } },
      select: { ayatCount: true },
    });
    const ayatDibaca = sessions.reduce((s, r) => s + r.ayatCount, 0);
    const today = todayUTC();
    const totalHari = Math.max(1, inclusiveDays(goal.mulai, goal.targetTanggal));
    const hariBerjalan = Math.max(
      0,
      Math.min(totalHari, inclusiveDays(goal.mulai, today)),
    );
    const sisaHari = Math.max(1, inclusiveDays(today, goal.targetTanggal));
    const sisaAyat = Math.max(0, TOTAL_AYAT - ayatDibaca);
    const targetPerHari = Math.ceil(TOTAL_AYAT / totalHari);
    const targetPerHariSisa = Math.ceil(sisaAyat / sisaHari);
    const targetSampaiHariIni = targetPerHari * hariBerjalan;
    return {
      totalAyat: TOTAL_AYAT,
      ayatDibaca,
      sisaAyat,
      persen: Math.min(100, Math.round((ayatDibaca / TOTAL_AYAT) * 100)),
      totalHari,
      hariBerjalan,
      sisaHari: inclusiveDays(today, goal.targetTanggal) - 1, // hari penuh tersisa
      targetPerHari,
      targetPerHariSisa,
      onTrack: ayatDibaca >= targetSampaiHariIni,
      selesai: ayatDibaca >= TOTAL_AYAT,
    };
  }

  async getKhatam(userId: string): Promise<ResponsePayload<unknown>> {
    const goal = await this.prisma.khatamGoal.findUnique({ where: { userId } });
    if (!goal) {
      return ok(null, 'Belum ada rencana khatam');
    }
    const progress = await this.khatamProgress(userId, goal);
    return ok({ ...goal, ...progress }, 'Progress khatam');
  }

  async upsertKhatam(
    userId: string,
    dto: UpsertKhatamDto,
  ): Promise<ResponsePayload<unknown>> {
    if (dto.targetTanggal <= dto.mulai) {
      throw new BadRequestException({
        message: 'Target tanggal harus setelah tanggal mulai',
        error: 'BAD_REQUEST',
      });
    }
    const goal = await this.prisma.khatamGoal.upsert({
      where: { userId },
      update: { mulai: dto.mulai, targetTanggal: dto.targetTanggal },
      create: { userId, mulai: dto.mulai, targetTanggal: dto.targetTanggal },
    });
    const progress = await this.khatamProgress(userId, goal);
    return ok({ ...goal, ...progress }, 'Rencana khatam disimpan');
  }

  async deleteKhatam(userId: string): Promise<ResponsePayload<unknown>> {
    await this.prisma.khatamGoal.deleteMany({ where: { userId } });
    return ok({ deleted: true }, 'Rencana khatam dihapus');
  }
}
