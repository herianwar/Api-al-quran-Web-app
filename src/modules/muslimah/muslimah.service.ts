import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  PaginationQueryDto,
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { gregorianStringToHijri } from '../hijri/hijri.converter';
import {
  IbadahStatus,
  addDaysIso,
  hariTerlarangRange,
  inclusiveDays,
  isoToUtcDate,
  jakartaTodayIso,
  predictNextHaid,
  puasaSunnahRange,
  ramadhanDaysInRange,
  rulingFor,
} from './muslimah.fiqh';
import { AMALAN_CATALOG, AMALAN_KEYS } from './muslimah.catalog';
import {
  BayarQadhaDto,
  CreateHaidPeriodDto,
  CreateQadhaDto,
  ToggleAmalanDto,
  UpdateHaidPeriodDto,
  UpdateQadhaDto,
} from './dto/muslimah.dto';

/** Shape a HaidPeriod row for the wire: dates as ISO `YYYY-MM-DD` strings. */
function mapPeriod(p: {
  id: string;
  jenis: string;
  mulai: Date;
  selesai: Date | null;
  catatan: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const mulaiIso = p.mulai.toISOString().slice(0, 10);
  const selesaiIso = p.selesai ? p.selesai.toISOString().slice(0, 10) : null;
  return {
    id: p.id,
    jenis: p.jenis,
    mulai: mulaiIso,
    selesai: selesaiIso,
    berlangsung: selesaiIso === null,
    durasiHari: selesaiIso ? inclusiveDays(mulaiIso, selesaiIso) : null,
    catatan: p.catatan,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

@Injectable()
export class MuslimahService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Riwayat siklus (haid / nifas / istihadhah) ──────────────────────

  async listPeriods(
    userId: string,
    pagination: PaginationQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const { skip, take } = paginationArgs(pagination);
    const where = { userId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.haidPeriod.count({ where }),
      this.prisma.haidPeriod.findMany({
        where,
        orderBy: { mulai: 'desc' },
        skip,
        take,
      }),
    ]);
    return ok(rows.map(mapPeriod), 'Riwayat siklus', paginationMeta(pagination, total));
  }

  async createPeriod(
    userId: string,
    dto: CreateHaidPeriodDto,
  ): Promise<ResponsePayload<unknown>> {
    if (dto.selesai && dto.selesai < dto.mulai) {
      throw new BadRequestException({
        message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
        error: 'BAD_REQUEST',
      });
    }
    const jenis = dto.jenis ?? 'haid';
    const row = await this.prisma.haidPeriod.create({
      data: {
        userId,
        jenis,
        mulai: isoToUtcDate(dto.mulai),
        selesai: dto.selesai ? isoToUtcDate(dto.selesai) : null,
        catatan: dto.catatan,
      },
    });

    // Hitung berapa hari periode ini jatuh di Ramadhan → saran qadha puasa.
    const qadhaRamadhan =
      jenis === 'istihadhah'
        ? 0
        : ramadhanDaysInRange(dto.mulai, dto.selesai ?? null);

    return ok(
      { ...mapPeriod(row), qadhaRamadhan },
      qadhaRamadhan > 0
        ? `Tercatat. ${qadhaRamadhan} hari jatuh di Ramadhan — disarankan menambah qadha puasa.`
        : 'Periode tercatat',
    );
  }

  async updatePeriod(
    userId: string,
    id: string,
    dto: UpdateHaidPeriodDto,
  ): Promise<ResponsePayload<unknown>> {
    const existing = await this.prisma.haidPeriod.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Periode tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    const nextMulai = dto.mulai ?? existing.mulai.toISOString().slice(0, 10);
    // selesai: undefined = jangan ubah; "" = tandai masih berlangsung (null).
    let nextSelesai: string | null;
    if (dto.selesai === undefined) {
      nextSelesai = existing.selesai
        ? existing.selesai.toISOString().slice(0, 10)
        : null;
    } else {
      nextSelesai = dto.selesai === '' ? null : dto.selesai;
    }
    if (nextSelesai && nextSelesai < nextMulai) {
      throw new BadRequestException({
        message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
        error: 'BAD_REQUEST',
      });
    }
    const row = await this.prisma.haidPeriod.update({
      where: { id },
      data: {
        jenis: dto.jenis ?? existing.jenis,
        mulai: isoToUtcDate(nextMulai),
        selesai: nextSelesai ? isoToUtcDate(nextSelesai) : null,
        catatan: dto.catatan ?? existing.catatan,
      },
    });
    return ok(mapPeriod(row), 'Periode diperbarui');
  }

  async deletePeriod(
    userId: string,
    id: string,
  ): Promise<ResponsePayload<unknown>> {
    const result = await this.prisma.haidPeriod.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        message: 'Periode tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok({ deleted: true }, 'Periode dihapus');
  }

  // ─── Status ibadah pada tanggal tertentu ─────────────────────────────

  async status(
    userId: string,
    date?: string,
  ): Promise<ResponsePayload<unknown>> {
    const target = date ?? jakartaTodayIso();
    const targetDate = isoToUtcDate(target);

    // Periode yang mencakup `target`: mulai <= target DAN (selesai null ATAU
    // selesai >= target). Ambil yang paling akhir mulainya bila tumpang tindih.
    const covering = await this.prisma.haidPeriod.findFirst({
      where: {
        userId,
        mulai: { lte: targetDate },
        OR: [{ selesai: null }, { selesai: { gte: targetDate } }],
      },
      orderBy: { mulai: 'desc' },
    });

    const status: IbadahStatus = (covering?.jenis as IbadahStatus) ?? 'suci';
    const ruling = rulingFor(status);
    const hijri = gregorianStringToHijri(target);

    let periode: ReturnType<typeof mapPeriod> | null = null;
    let hariKe: number | null = null;
    if (covering) {
      periode = mapPeriod(covering);
      hariKe = inclusiveDays(periode.mulai, target);
    }

    return ok(
      {
        tanggal: target,
        hijri: {
          formatted: hijri.hijri.formatted,
          weekday: hijri.gregorian.weekday,
        },
        status,
        hariKe,
        periode,
        ibadah: ruling,
      },
      `Status ibadah ${target}`,
    );
  }

  // ─── Puasa sunnah (computed) ─────────────────────────────────────────

  async puasaSunnah(
    userId: string,
    hari: number,
  ): Promise<ResponsePayload<unknown>> {
    const mulai = jakartaTodayIso();
    const akhir = addDaysIso(mulai, hari - 1);
    const days = puasaSunnahRange(mulai, hari);

    // Tandai hari yang bertabrakan dengan haid/nifas user (tidak bisa puasa).
    const periods = await this.prisma.haidPeriod.findMany({
      where: {
        userId,
        jenis: { in: ['haid', 'nifas'] },
        mulai: { lte: isoToUtcDate(akhir) },
        OR: [{ selesai: null }, { selesai: { gte: isoToUtcDate(mulai) } }],
      },
      select: { mulai: true, selesai: true },
    });
    const inHaid = (iso: string): boolean =>
      periods.some((p) => {
        const m = p.mulai.toISOString().slice(0, 10);
        const s = p.selesai ? p.selesai.toISOString().slice(0, 10) : null;
        return iso >= m && (s === null ? iso <= jakartaTodayIso() : iso <= s);
      });

    const enriched = days.map((d) => ({ ...d, haid: inHaid(d.tanggal) }));
    const terlarang = hariTerlarangRange(mulai, hari);

    return ok(
      { mulai, akhir, hari, puasaSunnah: enriched, hariTerlarang: terlarang },
      `Puasa sunnah ${hari} hari ke depan`,
    );
  }

  // ─── Qadha puasa (ledger) ────────────────────────────────────────────

  async listQadha(userId: string): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.qadhaPuasa.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const totalHutang = rows.reduce((s, r) => s + r.jumlah, 0);
    const totalLunas = rows.reduce((s, r) => s + Math.min(r.lunas, r.jumlah), 0);
    const items = rows.map((r) => ({
      ...r,
      sisa: Math.max(0, r.jumlah - r.lunas),
      selesai: r.lunas >= r.jumlah,
    }));
    return ok(items, 'Daftar qadha puasa', {
      totalHutang,
      totalLunas,
      sisa: Math.max(0, totalHutang - totalLunas),
    });
  }

  async createQadha(
    userId: string,
    dto: CreateQadhaDto,
  ): Promise<ResponsePayload<unknown>> {
    const lunas = Math.min(dto.lunas ?? 0, dto.jumlah);
    const row = await this.prisma.qadhaPuasa.create({
      data: {
        userId,
        sumber: dto.sumber ?? 'haid',
        tahun: dto.tahun,
        jumlah: dto.jumlah,
        lunas,
        catatan: dto.catatan,
      },
    });
    return ok(row, 'Hutang qadha ditambahkan');
  }

  async updateQadha(
    userId: string,
    id: string,
    dto: UpdateQadhaDto,
  ): Promise<ResponsePayload<unknown>> {
    const existing = await this.prisma.qadhaPuasa.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Data qadha tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    const jumlah = dto.jumlah ?? existing.jumlah;
    const lunasRaw = dto.lunas ?? existing.lunas;
    const row = await this.prisma.qadhaPuasa.update({
      where: { id },
      data: {
        sumber: dto.sumber ?? existing.sumber,
        jumlah,
        lunas: Math.min(Math.max(0, lunasRaw), jumlah),
        catatan: dto.catatan ?? existing.catatan,
      },
    });
    return ok(row, 'Qadha diperbarui');
  }

  async bayarQadha(
    userId: string,
    id: string,
    dto: BayarQadhaDto,
  ): Promise<ResponsePayload<unknown>> {
    const existing = await this.prisma.qadhaPuasa.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Data qadha tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    const lunas = Math.min(existing.lunas + dto.jumlah, existing.jumlah);
    const row = await this.prisma.qadhaPuasa.update({
      where: { id },
      data: { lunas },
    });
    return ok(
      { ...row, sisa: Math.max(0, row.jumlah - row.lunas), selesai: row.lunas >= row.jumlah },
      lunas >= existing.jumlah ? 'Alhamdulillah, qadha lunas!' : 'Pembayaran qadha dicatat',
    );
  }

  async deleteQadha(
    userId: string,
    id: string,
  ): Promise<ResponsePayload<unknown>> {
    const result = await this.prisma.qadhaPuasa.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        message: 'Data qadha tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok({ deleted: true }, 'Qadha dihapus');
  }

  // ─── Prediksi siklus ──────────────────────────────────────────────────

  /** Ambil periode (haid + lainnya) terbaru untuk dasar prediksi. */
  private async loadPeriodsForPrediction(userId: string) {
    const rows = await this.prisma.haidPeriod.findMany({
      where: { userId },
      orderBy: { mulai: 'desc' },
      take: 24,
      select: { jenis: true, mulai: true, selesai: true },
    });
    return rows.map((r) => ({
      jenis: r.jenis,
      mulai: r.mulai.toISOString().slice(0, 10),
      selesai: r.selesai ? r.selesai.toISOString().slice(0, 10) : null,
    }));
  }

  async prediksi(userId: string): Promise<ResponsePayload<unknown>> {
    const periods = await this.loadPeriodsForPrediction(userId);
    const p = predictNextHaid(periods);
    return ok(p, 'Prediksi siklus haid');
  }

  // ─── Habit tracker: amalan harian ─────────────────────────────────────

  async amalanHari(
    userId: string,
    tanggal?: string,
  ): Promise<ResponsePayload<unknown>> {
    const hari = tanggal ?? jakartaTodayIso();
    const rows = await this.prisma.amalanLog.findMany({
      where: { userId, tanggal: hari },
      select: { key: true },
    });
    const done = new Set(rows.map((r) => r.key));
    const items = AMALAN_CATALOG.map((a) => ({ ...a, done: done.has(a.key) }));
    const selesai = items.filter((i) => i.done).length;
    return ok(
      {
        tanggal: hari,
        total: AMALAN_CATALOG.length,
        selesai,
        persen: Math.round((selesai / AMALAN_CATALOG.length) * 100),
        items,
      },
      `Amalan ${hari}`,
    );
  }

  async toggleAmalan(
    userId: string,
    dto: ToggleAmalanDto,
  ): Promise<ResponsePayload<unknown>> {
    if (!AMALAN_KEYS.has(dto.key)) {
      throw new BadRequestException({
        message: `Amalan "${dto.key}" tidak dikenal`,
        error: 'BAD_REQUEST',
      });
    }
    const tanggal = dto.tanggal ?? jakartaTodayIso();
    if (dto.done) {
      // Idempotent: abaikan bila sudah ada (unique constraint).
      await this.prisma.amalanLog
        .create({ data: { userId, tanggal, key: dto.key } })
        .catch(() => undefined);
    } else {
      await this.prisma.amalanLog.deleteMany({
        where: { userId, tanggal, key: dto.key },
      });
    }
    return this.amalanHari(userId, tanggal);
  }

  /** Streak amalan: hari berturut-turut (mundur dari hari ini) yang punya ≥1 amalan. */
  async amalanStats(userId: string): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.amalanLog.findMany({
      where: { userId },
      orderBy: { tanggal: 'desc' },
      take: 1000,
      select: { tanggal: true, key: true },
    });
    const byDay = new Map<string, number>();
    for (const r of rows) byDay.set(r.tanggal, (byDay.get(r.tanggal) ?? 0) + 1);

    const today = jakartaTodayIso();
    let cursor = byDay.has(today) ? today : addDaysIso(today, -1);
    let current = 0;
    while (byDay.has(cursor)) {
      current += 1;
      cursor = addDaysIso(cursor, -1);
    }

    const last14 = Array.from({ length: 14 }, (_, i) => {
      const t = addDaysIso(today, -(13 - i));
      return { tanggal: t, count: byDay.get(t) ?? 0 };
    });

    return ok(
      { current, activeToday: byDay.has(today), total: AMALAN_CATALOG.length, last14 },
      'Statistik amalan harian',
    );
  }

  // ─── Dashboard Muslimah (agregasi) ───────────────────────────────────

  async dashboard(userId: string): Promise<ResponsePayload<unknown>> {
    const today = jakartaTodayIso();
    const todayDate = isoToUtcDate(today);
    const hijri = gregorianStringToHijri(today);

    const [covering, qadhaRows, hafalanDue, amalanRows] =
      await this.prisma.$transaction([
        this.prisma.haidPeriod.findFirst({
          where: {
            userId,
            mulai: { lte: todayDate },
            OR: [{ selesai: null }, { selesai: { gte: todayDate } }],
          },
          orderBy: { mulai: 'desc' },
        }),
        this.prisma.qadhaPuasa.findMany({ where: { userId } }),
        this.prisma.hafalan.count({
          where: { userId, nextReviewAt: { lte: new Date() } },
        }),
        this.prisma.amalanLog.count({ where: { userId, tanggal: today } }),
      ]);

    const periodsForPrediction = await this.loadPeriodsForPrediction(userId);
    const prediksi = predictNextHaid(periodsForPrediction, today);

    const status: IbadahStatus = (covering?.jenis as IbadahStatus) ?? 'suci';
    const ruling = rulingFor(status);
    const periode = covering ? mapPeriod(covering) : null;
    const hariKe = periode ? inclusiveDays(periode.mulai, today) : null;

    const totalHutang = qadhaRows.reduce((s, r) => s + r.jumlah, 0);
    const totalLunas = qadhaRows.reduce(
      (s, r) => s + Math.min(r.lunas, r.jumlah),
      0,
    );

    // Puasa sunnah terdekat dalam 45 hari (yang tidak bertabrakan dgn haid).
    const sunnah = puasaSunnahRange(today, 45);
    let berikutnya: (typeof sunnah)[number] | null = null;
    for (const d of sunnah) {
      const blocked =
        (status === 'haid' || status === 'nifas') &&
        periode !== null &&
        d.tanggal >= periode.mulai &&
        (periode.selesai === null ? d.tanggal <= today : d.tanggal <= periode.selesai);
      if (!blocked) {
        berikutnya = d;
        break;
      }
    }

    return ok(
      {
        tanggal: today,
        hijri: {
          formatted: hijri.hijri.formatted,
          weekday: hijri.gregorian.weekday,
        },
        statusHaid: {
          status,
          label: ruling.label,
          hariKe,
          periode,
          ibadah: ruling,
        },
        qadhaPuasa: {
          totalHutang,
          totalLunas,
          sisa: Math.max(0, totalHutang - totalLunas),
        },
        puasaSunnahBerikutnya: berikutnya,
        hafalanReviewDue: hafalanDue,
        amalanHariIni: {
          selesai: amalanRows,
          total: AMALAN_CATALOG.length,
          persen: Math.round((amalanRows / AMALAN_CATALOG.length) * 100),
        },
        prediksi: {
          cukupData: prediksi.cukupData,
          prediksiMulai: prediksi.prediksiMulai,
          hariLagi: prediksi.hariLagi,
          rataSiklus: prediksi.rataSiklus,
          keterangan: prediksi.keterangan,
        },
      },
      'Dashboard Muslimah',
    );
  }
}
