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

  async getKotaByProvinsi(
    provinsi?: string,
  ): Promise<ResponsePayload<unknown>> {
    await this.ensureKotaSeeded();
    // When provinsi is omitted, return the full list — myquran's kota feed
    // doesn't carry provinsi metadata (everything lands in "Lainnya"), so the
    // frontend prefers a single searchable list of all 518 entries.
    const cacheKey = provinsi
      ? CacheKey.kotaList(provinsi)
      : CacheKey.kotaList('__all__');
    const { data, cached } = await this.redis.remember(
      cacheKey,
      CacheTtl.JADWAL_SHOLAT,
      () =>
        this.prisma.kota.findMany({
          where: provinsi
            ? { provinsi: { equals: provinsi, mode: 'insensitive' } }
            : undefined,
          orderBy: { nama: 'asc' },
        }),
    );
    return ok(
      data,
      provinsi
        ? `Daftar kota provinsi ${provinsi}`
        : 'Daftar seluruh kota',
      { total: data.length, cached },
    );
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
  async fetchAndStoreMonth(
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
    // Force one external fetch when the kota row still has the seed
    // placeholder "Lainnya" — we need myquran's `daerah` to back-fill the
    // real provinsi. After that we skip on cache hit as usual.
    const kotaCheck = await this.prisma.kota.findUnique({
      where: { id: kotaId },
      select: { provinsi: true },
    });
    const needsProvinsiEnrich =
      !kotaCheck?.provinsi ||
      kotaCheck.provinsi === 'Lainnya' ||
      kotaCheck.provinsi === '-';
    if (existing.length > 0 && !needsProvinsiEnrich) return existing;

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
    // Back-fill: when myquran responds with a real `daerah` and our kota row
    // still has the placeholder "Lainnya", update the row so subsequent
    // queries (provinsi list, kota-by-provinsi) work properly.
    if (
      kota &&
      provinsi &&
      provinsi !== '-' &&
      (kota.provinsi === 'Lainnya' || kota.provinsi === '-' || !kota.provinsi)
    ) {
      try {
        await this.prisma.kota.update({
          where: { id: kotaId },
          data: { provinsi, ...(namaKota ? { nama: namaKota } : {}) },
        });
        kota.provinsi = provinsi;
        // Invalidate the cached provinsi/kota lists so the next read picks up
        // the enriched value.
        await this.redis.del(CacheKey.provinsiList());
        await this.redis.delByPattern('sholat:kota:*');
      } catch (err) {
        this.logger.warn(
          `Gagal enrich provinsi kota ${kotaId}: ${(err as Error).message}`,
        );
      }
    }

    const records = items
      .map((item) => this.mapJadwalItem(item, kotaId, namaKota, provinsi, kota))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    let failed = 0;
    for (const rec of records) {
      try {
        await this.prisma.jadwalSholat.upsert({
          where: { kotaId_tanggal: { kotaId, tanggal: rec.tanggal } },
          create: rec,
          update: rec,
        });
      } catch (err) {
        failed++;
        this.logger.warn(
          `Gagal upsert jadwal ${kotaId} ${rec.tanggal.toISOString().slice(0, 10)}: ${(err as Error).message}`,
        );
      }
    }
    if (failed > 0) {
      this.logger.warn(
        `Jadwal ${kotaId} ${bulan}/${tahun}: ${failed}/${records.length} entri gagal disimpan`,
      );
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
    // Prefer the live `daerah` from myquran's response (e.g. "DKI JAKARTA")
    // over a stale kota.provinsi fallback like "Lainnya" — the kota table is
    // seeded from /sholat/kota/semua which doesn't ship provinsi metadata.
    const isStaleProvinsi =
      !kota?.provinsi ||
      kota.provinsi === 'Lainnya' ||
      kota.provinsi === '-';
    const resolvedProvinsi = isStaleProvinsi
      ? (provinsi ?? kota?.provinsi ?? '-')
      : kota.provinsi;
    return {
      kotaId,
      namaKota: kota?.nama ?? namaKota ?? kotaId,
      provinsi: resolvedProvinsi,
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
      let failed = 0;
      for (const it of items) {
        const id = String(it.id ?? it.kode ?? '');
        if (!id) continue;
        const nama = String(it.lokasi ?? it.nama ?? id);
        const provinsi = String(it.daerah ?? it.provinsi ?? 'Lainnya');
        try {
          await this.prisma.kota.upsert({
            where: { id },
            create: { id, nama, provinsi },
            update: { nama, provinsi },
          });
        } catch (err) {
          failed++;
          if (failed <= 3) {
            this.logger.warn(
              `Gagal upsert kota ${id}: ${(err as Error).message}`,
            );
          }
        }
      }
      if (failed > 0) {
        this.logger.warn(`Seed kota: ${failed}/${items.length} entri gagal`);
      }
      this.logger.log(`Kota seeded: ${items.length} entri`);
    } catch (error) {
      this.logger.warn(
        `Gagal seed daftar kota dari equran.id: ${(error as Error).message}`,
      );
    }
  }
}
