import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { EquranService } from '../../common/equran/equran.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheKey, CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';

interface RawJadwalItem {
  date?: string;
  tanggal?: string;
  imsak?: string;
  subuh?: string;
  terbit?: string;
  dhuha?: string;
  dzuhur?: string;
  ashar?: string;
  maghrib?: string;
  isya?: string;
}

/**
 * Jadwal sholat is fetched lazily from equran.id (per kota per month) and
 * cached in the DB so subsequent requests are self-hosted.
 *
 * NOTE: equran.id's prayer-schedule field names are mapped defensively here.
 * If the live API differs, only the extract/map helpers below need adjusting.
 */
@Injectable()
export class SholatService {
  private readonly logger = new Logger(SholatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly equran: EquranService,
    private readonly redis: RedisService,
  ) {}

  // ─── Provinsi / Kota ────────────────────────────────────────────────

  async getProvinsiList(): Promise<ResponsePayload<unknown>> {
    await this.ensureKotaSeeded();
    const { data, cached } = await this.redis.remember(
      CacheKey.provinsiList(),
      CacheTtl.JADWAL_SHOLAT,
      async () => {
        const rows = await this.prisma.kota.findMany({
          distinct: ['provinsi'],
          orderBy: { provinsi: 'asc' },
          select: { provinsi: true },
        });
        return rows.map((r) => r.provinsi);
      },
    );
    return ok(data, 'Daftar provinsi berhasil diambil', {
      total: data.length,
      cached,
    });
  }

  async getKotaByProvinsi(provinsi: string): Promise<ResponsePayload<unknown>> {
    await this.ensureKotaSeeded();
    const { data, cached } = await this.redis.remember(
      CacheKey.kotaList(provinsi),
      CacheTtl.JADWAL_SHOLAT,
      () =>
        this.prisma.kota.findMany({
          where: { provinsi: { equals: provinsi, mode: 'insensitive' } },
          orderBy: { nama: 'asc' },
        }),
    );
    return ok(data, `Daftar kota provinsi ${provinsi}`, {
      total: data.length,
      cached,
    });
  }

  // ─── Jadwal ─────────────────────────────────────────────────────────

  async getJadwal(
    kotaId: string,
    bulan?: number,
    tahun?: number,
  ): Promise<ResponsePayload<unknown>> {
    const now = new Date();
    const b = bulan ?? now.getMonth() + 1;
    const y = tahun ?? now.getFullYear();

    const rows = await this.fetchAndStoreMonth(kotaId, b, y);
    if (rows.length === 0) {
      throw new NotFoundException({
        message: `Jadwal sholat untuk kota ${kotaId} (${b}/${y}) tidak tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(rows, 'Jadwal sholat berhasil diambil', {
      kotaId,
      bulan: b,
      tahun: y,
      total: rows.length,
    });
  }

  async getHariIni(kotaId: string): Promise<ResponsePayload<unknown>> {
    const now = new Date();
    const bulan = now.getMonth() + 1;
    const tahun = now.getFullYear();
    await this.fetchAndStoreMonth(kotaId, bulan, tahun);

    const today = this.dateOnly(now);
    const row = await this.prisma.jadwalSholat.findUnique({
      where: { kotaId_tanggal: { kotaId, tanggal: today } },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Jadwal sholat hari ini untuk kota ${kotaId} tidak tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Jadwal sholat hari ini');
  }

  /** Return month's jadwal from DB; fetch+store from equran.id on cache miss. */
  private async fetchAndStoreMonth(
    kotaId: string,
    bulan: number,
    tahun: number,
  ) {
    const monthStart = new Date(Date.UTC(tahun, bulan - 1, 1));
    const monthEnd = new Date(Date.UTC(tahun, bulan, 1));

    const existing = await this.prisma.jadwalSholat.findMany({
      where: { kotaId, tanggal: { gte: monthStart, lt: monthEnd } },
      orderBy: { tanggal: 'asc' },
    });
    if (existing.length > 0) return existing;

    let raw: unknown;
    try {
      raw = await this.equran.getJadwalSholat(kotaId, bulan, tahun);
    } catch (error) {
      this.logger.warn(
        `Gagal fetch jadwal ${kotaId} ${bulan}/${tahun}: ${(error as Error).message}`,
      );
      return [];
    }

    const { items, namaKota, provinsi } = this.parseJadwal(raw);
    const kota = await this.prisma.kota.findUnique({ where: { id: kotaId } });

    const records = items
      .map((item) => this.mapJadwalItem(item, kotaId, namaKota, provinsi, kota))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    for (const rec of records) {
      await this.prisma.jadwalSholat
        .upsert({
          where: { kotaId_tanggal: { kotaId, tanggal: rec.tanggal } },
          create: rec,
          update: rec,
        })
        .catch(() => undefined);
    }

    return this.prisma.jadwalSholat.findMany({
      where: { kotaId, tanggal: { gte: monthStart, lt: monthEnd } },
      orderBy: { tanggal: 'asc' },
    });
  }

  // ─── Defensive parsing helpers ──────────────────────────────────────

  private parseJadwal(raw: unknown): {
    items: RawJadwalItem[];
    namaKota?: string;
    provinsi?: string;
  } {
    const root = (raw ?? {}) as Record<string, unknown>;
    const data = (root.data ?? root) as Record<string, unknown>;
    const jadwal = (data.jadwal ?? data) as unknown;
    const items = Array.isArray(jadwal) ? (jadwal as RawJadwalItem[]) : [];
    return {
      items,
      namaKota: (data.lokasi ?? data.namaKota) as string | undefined,
      provinsi: (data.daerah ?? data.provinsi) as string | undefined,
    };
  }

  private mapJadwalItem(
    item: RawJadwalItem,
    kotaId: string,
    namaKota: string | undefined,
    provinsi: string | undefined,
    kota: { nama: string; provinsi: string } | null,
  ) {
    const tanggal = this.parseDate(item.date ?? item.tanggal);
    if (!tanggal) return null;
    return {
      kotaId,
      namaKota: kota?.nama ?? namaKota ?? kotaId,
      provinsi: kota?.provinsi ?? provinsi ?? '-',
      tanggal,
      imsak: item.imsak ?? '-',
      subuh: item.subuh ?? '-',
      terbit: item.terbit ?? '-',
      dhuha: item.dhuha ?? '-',
      dzuhur: item.dzuhur ?? '-',
      ashar: item.ashar ?? '-',
      maghrib: item.maghrib ?? '-',
      isya: item.isya ?? '-',
    };
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    // Accept YYYY-MM-DD directly.
    const iso = /^\d{4}-\d{2}-\d{2}$/.exec(value);
    if (iso) return new Date(`${value}T00:00:00.000Z`);
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : this.dateOnly(parsed);
  }

  private dateOnly(d: Date): Date {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  /** Populate the Kota table from equran.id on first use (best-effort). */
  private async ensureKotaSeeded(): Promise<void> {
    const count = await this.prisma.kota.count();
    if (count > 0) return;
    try {
      const raw = await this.equran.getKotaListRaw();
      const root = (raw ?? {}) as Record<string, unknown>;
      const arr = (root.data ?? root) as unknown;
      const items = Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
      for (const it of items) {
        const id = String(it.id ?? it.kode ?? '');
        if (!id) continue;
        const nama = String(it.lokasi ?? it.nama ?? id);
        const provinsi = String(it.daerah ?? it.provinsi ?? 'Lainnya');
        await this.prisma.kota
          .upsert({
            where: { id },
            create: { id, nama, provinsi },
            update: { nama, provinsi },
          })
          .catch(() => undefined);
      }
      this.logger.log(`Kota seeded: ${items.length} entri`);
    } catch (error) {
      this.logger.warn(
        `Gagal seed daftar kota dari equran.id: ${(error as Error).message}`,
      );
    }
  }
}
