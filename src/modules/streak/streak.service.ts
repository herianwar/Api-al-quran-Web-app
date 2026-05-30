import { Injectable } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { LogSessionDto, UpdateGoalDto } from './dto/streak.dto';

/** YYYY-MM-DD in UTC. Use this when the client doesn't supply a tanggal. */
function todayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
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
}
