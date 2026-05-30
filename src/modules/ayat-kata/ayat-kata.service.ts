import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';

const SEED_PATH = join(__dirname, '..', '..', '..', 'data', 'ayat-kata.json');

interface SeedItem {
  surah: number;
  ayat: number;
  kata: { arab: string; transliterasi?: string; arti: string }[];
}

@Injectable()
export class AyatKataService implements OnModuleInit {
  private readonly logger = new Logger(AyatKataService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent seed. Looks up internal ayatId from (surahNomor, nomorAyat),
   * then upserts each kata by (ayatId, posisi). Skips entries whose surah/ayat
   * doesn't exist (e.g. ayat data not yet seeded — bootstrap order).
   */
  async onModuleInit(): Promise<void> {
    try {
      const existing = await this.prisma.ayatKata.count();
      // Re-run only when count is way below seed size, so admin can safely
      // truncate to re-seed.
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const items: SeedItem[] = JSON.parse(raw);
      const targetCount = items.reduce((acc, x) => acc + x.kata.length, 0);
      if (existing >= targetCount) return;
      let written = 0;
      for (const it of items) {
        const surah = await this.prisma.surah.findUnique({
          where: { nomor: it.surah },
          select: { id: true },
        });
        if (!surah) continue;
        const ayat = await this.prisma.ayat.findUnique({
          where: {
            surahId_nomorAyat: { surahId: surah.id, nomorAyat: it.ayat },
          },
          select: { id: true },
        });
        if (!ayat) continue;
        let pos = 1;
        for (const k of it.kata) {
          await this.prisma.ayatKata.upsert({
            where: {
              ayatId_posisi: { ayatId: ayat.id, posisi: pos },
            },
            update: {
              arab: k.arab,
              transliterasi: k.transliterasi ?? null,
              arti: k.arti,
            },
            create: {
              ayatId: ayat.id,
              posisi: pos,
              arab: k.arab,
              transliterasi: k.transliterasi ?? null,
              arti: k.arti,
            },
          });
          pos += 1;
          written += 1;
        }
      }
      if (written > 0) this.logger.log(`Seeded ${written} ayat-kata rows`);
    } catch (err) {
      this.logger.warn(`Seed ayat-kata gagal: ${(err as Error).message}`);
    }
  }

  async forAyat(ayatId: number): Promise<ResponsePayload<unknown>> {
    const ayat = await this.prisma.ayat.findUnique({
      where: { id: ayatId },
      select: { id: true, nomorAyat: true },
    });
    if (!ayat) {
      throw new NotFoundException({
        message: `Ayat #${ayatId} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const kata = await this.prisma.ayatKata.findMany({
      where: { ayatId },
      orderBy: { posisi: 'asc' },
    });
    return ok(
      { ayatId, available: kata.length > 0, kata },
      kata.length > 0
        ? 'Kata-perkata berhasil diambil'
        : 'Kata-perkata belum tersedia untuk ayat ini',
      { total: kata.length },
    );
  }

  async forAyatBySurahAndNomor(
    surahNomor: number,
    nomorAyat: number,
  ): Promise<ResponsePayload<unknown>> {
    const surah = await this.prisma.surah.findUnique({
      where: { nomor: surahNomor },
      select: { id: true },
    });
    if (!surah) {
      throw new NotFoundException({
        message: `Surah #${surahNomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const ayat = await this.prisma.ayat.findUnique({
      where: {
        surahId_nomorAyat: { surahId: surah.id, nomorAyat },
      },
      select: { id: true },
    });
    if (!ayat) {
      throw new NotFoundException({
        message: `Ayat ${surahNomor}:${nomorAyat} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return this.forAyat(ayat.id);
  }
}
