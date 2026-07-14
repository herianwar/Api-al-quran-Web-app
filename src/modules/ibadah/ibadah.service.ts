import { Injectable } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IbadahItem,
  PRAYERS,
  SetItemDto,
  SetSholatDto,
} from './dto/ibadah.dto';

/** Bentuk baris `user_ibadah_daily` yang relevan (tanpa metadata). */
type DayRow = {
  tanggal: string;
  subuh: boolean;
  dzuhur: boolean;
  ashar: boolean;
  maghrib: boolean;
  isya: boolean;
  dzikir: boolean;
  tilawah: boolean;
  hafalan: boolean;
};

/**
 * ISO `YYYY-MM-DD` untuk hari ini di zona WIB (UTC+7), apa pun TZ server.
 * "Hari ini" pada checklist sholat mengikuti waktu lokal user Indonesia.
 */
function todayWIB(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/** Move a YYYY-MM-DD back/forward N days via UTC arithmetic. */
function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Bentuk harian lengkap dari satu baris (atau semua false bila null):
 * 5 waktu sholat + dzikir/tilawah/hafalan, jumlah sholat, dan `completedCount`
 * (dari 4 item: sholat dihitung selesai bila 5/5).
 */
function dayShape(tanggal: string, row: DayRow | null) {
  const sholat = {
    subuh: row?.subuh ?? false,
    dzuhur: row?.dzuhur ?? false,
    ashar: row?.ashar ?? false,
    maghrib: row?.maghrib ?? false,
    isya: row?.isya ?? false,
  };
  const sholatCount = PRAYERS.reduce((n, p) => n + (sholat[p] ? 1 : 0), 0);
  const dzikir = row?.dzikir ?? false;
  const tilawah = row?.tilawah ?? false;
  const hafalan = row?.hafalan ?? false;
  // completedCount = berapa dari 4 item (sholat penuh, dzikir, tilawah, hafalan)
  // yang selesai hari itu. Android bisa pakai ini atau hitung dari sholatCount.
  const completedCount =
    (sholatCount === 5 ? 1 : 0) +
    (dzikir ? 1 : 0) +
    (tilawah ? 1 : 0) +
    (hafalan ? 1 : 0);
  return {
    date: tanggal,
    sholat,
    sholatCount,
    dzikir,
    tilawah,
    hafalan,
    completedCount,
  };
}

@Injectable()
export class IbadahService {
  constructor(private readonly prisma: PrismaService) {}

  /** Progress ibadah harian (8 item) untuk hari ini (WIB). */
  async getToday(userId: string): Promise<ResponsePayload<unknown>> {
    const tanggal = todayWIB();
    const row = await this.prisma.userIbadahDaily.findUnique({
      where: { userId_tanggal: { userId, tanggal } },
    });
    return ok(dayShape(tanggal, row), 'Progress ibadah hari ini');
  }

  /**
   * Set/unset satu waktu sholat untuk HARI INI (WIB). Idempotent — memanggil
   * dengan nilai yang sama tak mengubah apa pun. Return bentuk sama seperti
   * getToday(). Dipertahankan untuk kompatibilitas Android versi lama;
   * secara internal alias ke setItem().
   */
  async setSholat(
    userId: string,
    dto: SetSholatDto,
  ): Promise<ResponsePayload<unknown>> {
    return this.setItem(userId, { item: dto.prayer, done: dto.done });
  }

  /**
   * Set/unset satu item ibadah (5 waktu sholat + dzikir/tilawah/hafalan) untuk
   * `dto.date` (default hari ini WIB). Idempotent via upsert. Return bentuk
   * harian sama seperti getToday().
   */
  async setItem(
    userId: string,
    dto: SetItemDto,
  ): Promise<ResponsePayload<unknown>> {
    const tanggal = dto.date ?? todayWIB();
    const item: IbadahItem = dto.item;
    const row = await this.prisma.userIbadahDaily.upsert({
      where: { userId_tanggal: { userId, tanggal } },
      update: { [item]: dto.done },
      create: { userId, tanggal, [item]: dto.done },
    });
    const isSholat = (PRAYERS as readonly string[]).includes(item);
    const label = isSholat ? 'Sholat' : 'Ibadah';
    return ok(
      dayShape(tanggal, row),
      dto.done ? `${label} ditandai` : `Tanda ${label.toLowerCase()} dibatalkan`,
    );
  }

  /**
   * Riwayat harian pada rentang [from, to] (inklusif). Hanya hari yang ada
   * datanya yang dikembalikan (hari tanpa aktivitas di-skip — client anggap
   * semua false). Default: 30 hari terakhir sampai hari ini (WIB).
   */
  async getHistory(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<ResponsePayload<unknown>> {
    const end = to ?? todayWIB();
    const start = from ?? shiftDate(end, -29);
    const rows = await this.prisma.userIbadahDaily.findMany({
      where: { userId, tanggal: { gte: start, lte: end } },
      orderBy: { tanggal: 'asc' },
    });
    const history = rows.map((r) => dayShape(r.tanggal, r));
    return ok(history, 'Riwayat progress ibadah');
  }

  /**
   * Agregat progress ibadah `days` hari terakhir (termasuk hari ini, WIB):
   * riwayat harian + streak hari dengan minimal satu sholat.
   */
  async getSummary(
    userId: string,
    days = 7,
  ): Promise<ResponsePayload<unknown>> {
    const today = todayWIB();
    const start = shiftDate(today, -(days - 1));
    const rows = await this.prisma.userIbadahDaily.findMany({
      where: { userId, tanggal: { gte: start, lte: today } },
      orderBy: { tanggal: 'asc' },
    });
    const byDate = new Map(rows.map((r) => [r.tanggal, r]));

    // Riwayat lengkap: isi hari kosong dengan semua false.
    const history: ReturnType<typeof dayShape>[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const tanggal = shiftDate(today, -i);
      history.push(dayShape(tanggal, byDate.get(tanggal) ?? null));
    }

    const totalSholat = history.reduce((n, h) => n + h.sholatCount, 0);
    const perfectDays = history.filter((h) => h.sholatCount === 5).length;

    // Streak: hari berturut-turut (mundur dari hari ini) dengan ≥1 sholat.
    // Hari ini yang belum ada sholat tidak memutus streak sampai hari berakhir.
    let current = 0;
    for (let i = 0; ; i++) {
      const tanggal = shiftDate(today, -i);
      const count = byDate.get(tanggal)
        ? PRAYERS.reduce((n, p) => n + (byDate.get(tanggal)![p] ? 1 : 0), 0)
        : 0;
      if (count > 0) {
        current += 1;
      } else if (i === 0) {
        continue; // hari ini belum sholat — jangan putus streak dulu
      } else {
        break;
      }
    }

    return ok(
      {
        days,
        from: start,
        to: today,
        totalSholat,
        perfectDays,
        currentStreak: current,
        history,
      },
      'Ringkasan progress ibadah',
    );
  }
}
