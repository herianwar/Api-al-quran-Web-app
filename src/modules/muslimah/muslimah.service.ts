import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  coversDate,
  findCoveringPeriod,
  hariTerlarangRange,
  inclusiveDays,
  isoToUtcDate,
  jakartaTodayIso,
  predictNextHaid,
  puasaSunnahRange,
  ramadanBerikutnya,
  ramadhanDaysByYear,
  ramadhanDaysInRange,
  rangesOverlap,
  rulingFor,
  statusKeterlambatan,
  toIsoDateOnly,
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

/** Baris HaidPeriod apa adanya dari Prisma. */
interface HaidRow {
  id: string;
  jenis: string;
  mulai: Date;
  selesai: Date | null;
  catatan: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Baris DB → rentang date-only. Semua logika (irisan, status, prediksi) bekerja
 * di atas bentuk ini supaya perbandingan tanggal tidak pernah menyentuh jam/TZ;
 * `createdAt`/`updatedAt` tetap instant UTC seperti yang dipakai app.
 */
interface HaidRange {
  id: string;
  jenis: string;
  mulai: string; // YYYY-MM-DD
  selesai: string | null; // YYYY-MM-DD | null (masih berlangsung)
  catatan: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRange(p: HaidRow): HaidRange {
  return {
    id: p.id,
    jenis: p.jenis,
    mulai: toIsoDateOnly(p.mulai),
    selesai: p.selesai ? toIsoDateOnly(p.selesai) : null,
    catatan: p.catatan,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** Shape a HaidPeriod range for the wire: dates as ISO `YYYY-MM-DD` strings. */
function mapRange(r: HaidRange) {
  return {
    id: r.id,
    jenis: r.jenis,
    mulai: r.mulai,
    selesai: r.selesai,
    berlangsung: r.selesai === null,
    durasiHari: r.selesai ? inclusiveDays(r.mulai, r.selesai) : null,
    catatan: r.catatan,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Idem, langsung dari baris DB (bentuk response tidak berubah). */
function mapPeriod(p: HaidRow) {
  return mapRange(toRange(p));
}

/** Kode error domain untuk siklus haid (dipakai client untuk bercabang). */
export const HAID_ACTIVE_EXISTS = 'HAID_ACTIVE_EXISTS';
export const HAID_OVERLAP = 'HAID_OVERLAP';
export const HAID_INVALID_RANGE = 'HAID_INVALID_RANGE';
/** Entri qadha otomatis tidak boleh dihapus/diubah jumlahnya oleh user. */
export const QADHA_AUTO_PROTECTED = 'QADHA_AUTO_PROTECTED';

/** Baris QadhaPuasa apa adanya dari Prisma. */
interface QadhaRow {
  id: string;
  userId: string;
  sumber: string;
  tahun: number | null;
  jumlah: number;
  lunas: number;
  catatan: string | null;
  otomatis: boolean;
  ramadanTahun: number | null;
  haidPeriodeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Bentuk wire sebuah entri qadha. Field lama (id, sumber, jumlah, lunas,
 * tahun, catatan, sisa, selesai) dipertahankan persis; sisanya tambahan.
 */
function mapQadha(r: QadhaRow, acuanIso: string) {
  const sisa = Math.max(0, r.jumlah - r.lunas);
  // Entri manual lama hanya punya `tahun`; pakai itu sebagai fallback supaya
  // deadline/fidyah tetap bisa dihitung tanpa mengubah data yang sudah ada.
  const tahunSumber = r.ramadanTahun ?? r.tahun;
  const { deadline, terlambat, fidyahHari } = statusKeterlambatan(
    tahunSumber,
    sisa,
    acuanIso,
  );
  return {
    ...r,
    sisa,
    selesai: r.lunas >= r.jumlah,
    otomatis: r.otomatis,
    ramadanTahun: r.ramadanTahun,
    haidPeriodeId: r.haidPeriodeId,
    deadline,
    terlambat,
    fidyahHari,
  };
}

@Injectable()
export class MuslimahService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Sumber kebenaran tunggal: daftar periode user ───────────────────

  /**
   * Semua periode milik user sebagai rentang date-only, terbaru dulu.
   * status/dashboard/prediksi/puasa-sunnah SEMUA membaca dari sini supaya tidak
   * ada dua endpoint yang menghitung "sedang haid?" dengan aturan berbeda.
   * Batas 500 baris ≈ puluhan tahun siklus; lebih dari itu tidak relevan.
   */
  private async loadPeriods(userId: string): Promise<HaidRange[]> {
    const rows = await this.prisma.haidPeriod.findMany({
      where: { userId },
      orderBy: { mulai: 'desc' },
      take: 500,
    });
    return rows.map(toRange);
  }

  /**
   * Validasi rentang sebuah periode terhadap periode lain milik user yang sama.
   * `excludeId` dipakai saat update agar entri itu sendiri tidak dianggap
   * bertabrakan dengan dirinya.
   *
   * Aturan:
   *  1. selesai < mulai                       → 422 HAID_INVALID_RANGE
   *  2. periode baru terbuka & sudah ada yang
   *     terbuka (selesai=null)                → 409 HAID_ACTIVE_EXISTS
   *  3. beririsan dengan periode mana pun     → 409 HAID_OVERLAP
   */
  private assertPeriodConsistent(
    periods: HaidRange[],
    candidate: { mulai: string; selesai: string | null },
    excludeId?: string,
  ): void {
    if (candidate.selesai && candidate.selesai < candidate.mulai) {
      throw new UnprocessableEntityException({
        message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
        error: HAID_INVALID_RANGE,
        code: HAID_INVALID_RANGE,
      });
    }

    const others = periods.filter((p) => p.id !== excludeId);

    if (candidate.selesai === null) {
      const active = others.find((p) => p.selesai === null);
      if (active) {
        throw new ConflictException({
          message: `Masih ada periode ${active.jenis} yang berlangsung sejak ${active.mulai}. Tutup dulu (isi tanggal selesai) sebelum mencatat periode baru.`,
          error: HAID_ACTIVE_EXISTS,
          code: HAID_ACTIVE_EXISTS,
        });
      }
    }

    const clash = others.find((p) =>
      rangesOverlap(candidate.mulai, candidate.selesai, p.mulai, p.selesai),
    );
    if (clash) {
      const rentang = clash.selesai
        ? `${clash.mulai} s/d ${clash.selesai}`
        : `${clash.mulai} (masih berlangsung)`;
      throw new ConflictException({
        message: `Rentang tanggal beririsan dengan periode ${clash.jenis} ${rentang}. Perbaiki tanggalnya atau hapus periode lama.`,
        error: HAID_OVERLAP,
        code: HAID_OVERLAP,
      });
    }
  }

  /**
   * Jalankan cek-lalu-tulis di bawah advisory lock per user, di dalam satu
   * transaksi. Tanpa ini dua POST yang datang bersamaan (double-tap di app)
   * sama-sama lolos cek "ada periode aktif?" lalu sama-sama menulis — persis
   * cara data korup itu terbentuk. Lock dilepas otomatis saat transaksi
   * selesai/rollback, dan hanya menahan request user yang sama.
   */
  private guardedWrite<T>(
    userId: string,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`muslimah:haid:${userId}`}))`;
      return run(tx);
    });
  }

  /** Periode user dibaca di dalam transaksi (lihat guardedWrite). */
  private async loadPeriodsTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<HaidRange[]> {
    const rows = await tx.haidPeriod.findMany({
      where: { userId },
      orderBy: { mulai: 'desc' },
      take: 500,
    });
    return rows.map(toRange);
  }

  // ─── Qadha otomatis dari haid ∩ Ramadhan ─────────────────────────────

  /**
   * Recompute entri qadha OTOMATIS milik satu periode haid. Dipanggil setiap
   * periode dibuat/diubah/dihapus, di dalam transaksi yang sama.
   *
   * Idempoten: kunci (userId, ramadanTahun, haidPeriodeId) membuat pemanggilan
   * berulang meng-update baris yang sama, bukan menambah baris baru.
   *
   * Aturan saat hutang mengecil/hilang (periode diperpendek atau dihapus):
   *  - `lunas` (pembayaran yang sudah tercatat) TIDAK PERNAH dibuang diam-diam.
   *  - Bila jumlah baru < lunas → lunas di-clamp ke jumlah baru dan alasannya
   *    ditulis di `catatan`.
   *  - Bila hutangnya hilang sama sekali tapi user sudah pernah membayar,
   *    barisnya DIPERTAHANKAN sebagai riwayat lunas (jumlah = lunas) — bukan
   *    dihapus. Baris tanpa pembayaran barulah dihapus supaya tidak jadi hantu.
   *
   * `periode = null` berarti periodenya dihapus → semua hutang otomatis dari
   * periode itu diperlakukan sebagai 0 hari.
   */
  private async syncQadhaOtomatis(
    tx: Prisma.TransactionClient,
    userId: string,
    periodeId: string,
    periode: { jenis: string; mulai: string; selesai: string | null } | null,
  ): Promise<void> {
    // Istihadhah dihukumi suci → puasanya sah, tidak ada hutang qadha.
    // Periode yang masih berlangsung juga belum menghasilkan hutang pasti.
    const byYear =
      periode && periode.jenis !== 'istihadhah'
        ? ramadhanDaysByYear(periode.mulai, periode.selesai)
        : new Map<number, number>();

    const existing = await tx.qadhaPuasa.findMany({
      where: { userId, haidPeriodeId: periodeId, otomatis: true },
    });

    // 1. Tahun yang masih punya hari Ramadhan → buat / sesuaikan.
    for (const [tahun, hari] of byYear) {
      const row = existing.find((e) => e.ramadanTahun === tahun);
      if (!row) {
        await tx.qadhaPuasa.create({
          data: {
            userId,
            sumber: periode?.jenis ?? 'haid',
            tahun,
            ramadanTahun: tahun,
            haidPeriodeId: periodeId,
            otomatis: true,
            jumlah: hari,
            lunas: 0,
            catatan: `Otomatis dari periode ${periode?.jenis ?? 'haid'} ${periode?.mulai} s/d ${periode?.selesai}.`,
          },
        });
        continue;
      }
      if (row.jumlah === hari) continue; // sudah sinkron — jangan sentuh
      const lunasBaru = Math.min(row.lunas, hari);
      await tx.qadhaPuasa.update({
        where: { id: row.id },
        data: {
          jumlah: hari,
          lunas: lunasBaru,
          catatan:
            lunasBaru < row.lunas
              ? `Disesuaikan otomatis: hutang ${row.jumlah} → ${hari} hari karena periode haid berubah. Pembayaran tercatat ${row.lunas} hari ikut disesuaikan ke ${lunasBaru}.`
              : `Disesuaikan otomatis: hutang ${row.jumlah} → ${hari} hari karena periode haid berubah.`,
        },
      });
    }

    // 2. Tahun yang tidak lagi punya hari Ramadhan → lunas dipertahankan,
    //    sisanya dihapus.
    for (const row of existing) {
      if (row.ramadanTahun !== null && byYear.has(row.ramadanTahun)) continue;
      if (row.lunas > 0) {
        await tx.qadhaPuasa.update({
          where: { id: row.id },
          data: {
            jumlah: row.lunas,
            catatan: `Periode haid sumber dihapus/diubah sehingga hutangnya gugur. Pembayaran ${row.lunas} hari yang sudah tercatat tetap disimpan sebagai riwayat.`,
          },
        });
      } else {
        await tx.qadhaPuasa.delete({ where: { id: row.id } });
      }
    }
  }

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
    const mulai = toIsoDateOnly(dto.mulai);
    const selesai = dto.selesai ? toIsoDateOnly(dto.selesai) : null;
    const jenis = dto.jenis ?? 'haid';

    const row = await this.guardedWrite(userId, async (tx) => {
      const existing = await this.loadPeriodsTx(tx, userId);
      this.assertPeriodConsistent(existing, { mulai, selesai });
      const created = await tx.haidPeriod.create({
        data: {
          userId,
          jenis,
          mulai: isoToUtcDate(mulai),
          selesai: selesai ? isoToUtcDate(selesai) : null,
          catatan: dto.catatan,
        },
      });
      await this.syncQadhaOtomatis(tx, userId, created.id, {
        jenis,
        mulai,
        selesai,
      });
      return created;
    });

    // Hitung berapa hari periode ini jatuh di Ramadhan → saran qadha puasa.
    const qadhaRamadhan =
      jenis === 'istihadhah' ? 0 : ramadhanDaysInRange(mulai, selesai);

    return ok(
      { ...mapPeriod(row), qadhaRamadhan },
      qadhaRamadhan > 0
        ? `Tercatat. ${qadhaRamadhan} hari jatuh di Ramadhan dan sudah dicatat otomatis sebagai qadha puasa — tidak perlu menambah manual.`
        : 'Periode tercatat',
    );
  }

  async updatePeriod(
    userId: string,
    id: string,
    dto: UpdateHaidPeriodDto,
  ): Promise<ResponsePayload<unknown>> {
    const row = await this.guardedWrite(userId, async (tx) => {
      const periods = await this.loadPeriodsTx(tx, userId);
      const existing = periods.find((p) => p.id === id);
      if (!existing) {
        throw new NotFoundException({
          message: 'Periode tidak ditemukan',
          error: 'NOT_FOUND',
        });
      }
      const nextMulai = dto.mulai ? toIsoDateOnly(dto.mulai) : existing.mulai;
      // selesai: undefined = jangan ubah; "" / null = tandai masih berlangsung.
      let nextSelesai: string | null;
      if (dto.selesai === undefined) {
        nextSelesai = existing.selesai;
      } else {
        nextSelesai =
          dto.selesai === null || dto.selesai === ''
            ? null
            : toIsoDateOnly(dto.selesai);
      }

      // Cek yang sama seperti create, tapi entri ini dikecualikan dari
      // pembandingan agar update yang tidak menggeser tanggal tidak "bentrok
      // dengan dirinya sendiri".
      this.assertPeriodConsistent(
        periods,
        { mulai: nextMulai, selesai: nextSelesai },
        id,
      );

      const nextJenis = dto.jenis ?? existing.jenis;
      const updated = await tx.haidPeriod.update({
        where: { id },
        data: {
          jenis: nextJenis,
          mulai: isoToUtcDate(nextMulai),
          selesai: nextSelesai ? isoToUtcDate(nextSelesai) : null,
          catatan: dto.catatan ?? existing.catatan,
        },
      });
      await this.syncQadhaOtomatis(tx, userId, id, {
        jenis: nextJenis,
        mulai: nextMulai,
        selesai: nextSelesai,
      });
      return updated;
    });
    return ok(mapPeriod(row), 'Periode diperbarui');
  }

  async deletePeriod(
    userId: string,
    id: string,
  ): Promise<ResponsePayload<unknown>> {
    await this.guardedWrite(userId, async (tx) => {
      const existing = await tx.haidPeriod.findFirst({ where: { id, userId } });
      if (!existing) {
        throw new NotFoundException({
          message: 'Periode tidak ditemukan',
          error: 'NOT_FOUND',
        });
      }
      // Rapikan qadha otomatisnya SEBELUM barisnya hilang, supaya pembayaran
      // yang sudah tercatat sempat diselamatkan (FK-nya SET NULL, bukan
      // cascade, jadi baris qadha tidak ikut terhapus diam-diam).
      await this.syncQadhaOtomatis(tx, userId, id, null);
      await tx.haidPeriod.delete({ where: { id } });
    });
    return ok({ deleted: true }, 'Periode dihapus');
  }

  // ─── Status ibadah pada tanggal tertentu ─────────────────────────────

  async status(
    userId: string,
    date?: string,
  ): Promise<ResponsePayload<unknown>> {
    const target = toIsoDateOnly(date ?? jakartaTodayIso());

    // Satu sumber kebenaran: daftar periode user. Periode yang masih
    // berlangsung (selesai=null) dianggap terbuka sampai +∞, jadi tanggal mana
    // pun setelah `mulai` ikut terhitung — bukan "suci".
    const periods = await this.loadPeriods(userId);
    const covering = findCoveringPeriod(periods, target);

    const status: IbadahStatus = (covering?.jenis as IbadahStatus) ?? 'suci';
    const ruling = rulingFor(status);
    const hijri = gregorianStringToHijri(target);

    let periode: ReturnType<typeof mapRange> | null = null;
    let hariKe: number | null = null;
    if (covering) {
      periode = mapRange(covering);
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
    // Pakai `coversDate` yang sama dengan /status & /dashboard supaya sebuah
    // hari tidak pernah dinyatakan "haid" di satu endpoint dan "suci" di
    // endpoint lain.
    const periods = (await this.loadPeriods(userId)).filter(
      (p) => p.jenis === 'haid' || p.jenis === 'nifas',
    );
    const inHaid = (iso: string): boolean =>
      periods.some((p) => coversDate(p, iso));

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
    const hariIni = jakartaTodayIso();
    const totalHutang = rows.reduce((s, r) => s + r.jumlah, 0);
    const totalLunas = rows.reduce((s, r) => s + Math.min(r.lunas, r.jumlah), 0);
    const items = rows.map((r) => mapQadha(r, hariIni));
    const totalFidyahHari = items.reduce((s, r) => s + r.fidyahHari, 0);

    return ok(items, 'Daftar qadha puasa', {
      totalHutang,
      totalLunas,
      sisa: Math.max(0, totalHutang - totalLunas),
      ramadanBerikutnya: ramadanBerikutnya(hariIni),
      totalFidyahHari,
      entriTerlambat: items.filter((r) => r.terlambat).length,
      disclaimer:
        'Perhitungan fidyah bersifat indikatif (jumhur: 1 mud makanan pokok per hari yang tertunda tanpa uzur). Untuk penetapan final, rujuk ke ustadz/ustadzah.',
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
    return ok(mapQadha(row, jakartaTodayIso()), 'Hutang qadha ditambahkan');
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
    // Entri otomatis: jumlah & sumber-nya dimiliki server (akan ditimpa lagi
    // oleh recompute berikutnya). Pembayaran & catatan tetap boleh diubah user.
    if (
      existing.otomatis &&
      ((dto.jumlah !== undefined && dto.jumlah !== existing.jumlah) ||
        (dto.sumber !== undefined && dto.sumber !== existing.sumber))
    ) {
      throw new ConflictException({
        message:
          'Entri qadha ini dihitung otomatis dari periode haid yang beririsan Ramadhan, jadi jumlah harinya tidak bisa diubah manual. Perbaiki tanggal periode haid-nya, atau catat pembayaran lewat tombol "bayar".',
        error: QADHA_AUTO_PROTECTED,
        code: QADHA_AUTO_PROTECTED,
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
    return ok(mapQadha(row, jakartaTodayIso()), 'Qadha diperbarui');
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
      mapQadha(row, jakartaTodayIso()),
      lunas >= existing.jumlah ? 'Alhamdulillah, qadha lunas!' : 'Pembayaran qadha dicatat',
    );
  }

  async deleteQadha(
    userId: string,
    id: string,
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
    // Entri otomatis = utang riil dari haid yang beririsan Ramadhan. Menghapus
    // di sini hanya akan dibuat ulang oleh recompute berikutnya, jadi tolak
    // dan arahkan user melunasi (atau memperbaiki tanggal periode haid-nya).
    if (existing.otomatis) {
      throw new ConflictException({
        message:
          'Qadha ini dihitung otomatis dari periode haid yang beririsan Ramadhan dan merupakan utang puasa yang riil, jadi tidak bisa dihapus. Catat pembayarannya sampai lunas, atau perbaiki tanggal periode haid-nya bila tanggalnya keliru.',
        error: QADHA_AUTO_PROTECTED,
        code: QADHA_AUTO_PROTECTED,
      });
    }
    await this.prisma.qadhaPuasa.delete({ where: { id } });
    return ok({ deleted: true }, 'Qadha dihapus');
  }

  // ─── Prediksi siklus ──────────────────────────────────────────────────

  /**
   * Periode terbaru untuk dasar prediksi — diambil dari daftar periode yang
   * sama dengan /status & /dashboard (bukan query terpisah), lalu dipotong 24
   * siklus terakhir.
   */
  private forPrediction(periods: HaidRange[]) {
    return periods
      .slice(0, 24)
      .map((r) => ({ jenis: r.jenis, mulai: r.mulai, selesai: r.selesai }));
  }

  async prediksi(userId: string): Promise<ResponsePayload<unknown>> {
    const periods = await this.loadPeriods(userId);
    const p = predictNextHaid(this.forPrediction(periods));
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
    const hijri = gregorianStringToHijri(today);

    const [qadhaRows, hafalanDue, amalanRows] = await this.prisma.$transaction([
      this.prisma.qadhaPuasa.findMany({ where: { userId } }),
      this.prisma.hafalan.count({
        where: { userId, nextReviewAt: { lte: new Date() } },
      }),
      this.prisma.amalanLog.count({ where: { userId, tanggal: today } }),
    ]);

    // Status & prediksi dihitung dari daftar periode yang sama persis dengan
    // /muslimah/status — dashboard tidak boleh punya aturannya sendiri.
    const periods = await this.loadPeriods(userId);
    const covering = findCoveringPeriod(periods, today);
    const prediksi = predictNextHaid(this.forPrediction(periods), today);

    const status: IbadahStatus = (covering?.jenis as IbadahStatus) ?? 'suci';
    const ruling = rulingFor(status);
    const periode = covering ? mapRange(covering) : null;
    const hariKe = periode ? inclusiveDays(periode.mulai, today) : null;

    const totalHutang = qadhaRows.reduce((s, r) => s + r.jumlah, 0);
    const totalLunas = qadhaRows.reduce(
      (s, r) => s + Math.min(r.lunas, r.jumlah),
      0,
    );

    // Puasa sunnah terdekat dalam 45 hari (yang tidak bertabrakan dgn haid).
    const sunnah = puasaSunnahRange(today, 45);
    let berikutnya: (typeof sunnah)[number] | null = null;
    const pemblokir = periods.filter(
      (p) => p.jenis === 'haid' || p.jenis === 'nifas',
    );
    for (const d of sunnah) {
      const blocked = pemblokir.some((p) => coversDate(p, d.tanggal));
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
