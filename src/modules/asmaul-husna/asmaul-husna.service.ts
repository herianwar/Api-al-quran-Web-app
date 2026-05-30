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

/** Server-side TTS-generated audio files (one per name, ~12KB each).
 *  Self-hosted; consistent quality across all client browsers. */
const AUDIO_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'audio-asmaul-husna',
);

const DETAIL_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'asmaul-husna-detail.json',
);

interface DetailItem {
  id: number;
  penjelasan?: string;
  dalil?: string;
  faidah?: string;
}

@Injectable()
export class AsmaulHusnaService implements OnModuleInit {
  private readonly logger = new Logger(AsmaulHusnaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * On boot, fill in penjelasan/dalil/faidah for rows missing it. The base 99
   * rows are seeded by SeedService; this only enriches existing rows so it
   * never creates new ones. Idempotent.
   */
  async onModuleInit(): Promise<void> {
    try {
      const missing = await this.prisma.asmaulHusna.count({
        where: { penjelasan: null },
      });
      if (missing === 0) return;
      const raw = await fsp.readFile(DETAIL_PATH, 'utf-8');
      const items: DetailItem[] = JSON.parse(raw);
      let updated = 0;
      for (const it of items) {
        const result = await this.prisma.asmaulHusna.updateMany({
          where: { id: it.id, penjelasan: null },
          data: {
            penjelasan: it.penjelasan ?? null,
            dalil: it.dalil ?? null,
            faidah: it.faidah ?? null,
          },
        });
        updated += result.count;
      }
      if (updated > 0) {
        this.logger.log(
          `Asmaul Husna detail enriched: ${updated} rows updated`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Asmaul Husna detail seed failed: ${(err as Error).message}`,
      );
    }
  }

  async getAudioFile(id: number): Promise<{ path: string; size: number }> {
    if (id < 1 || id > 99) {
      throw new NotFoundException({
        message: `Asmaul Husna #${id} di luar rentang 1-99`,
        error: 'NOT_FOUND',
      });
    }
    const path = join(AUDIO_DIR, `${String(id).padStart(3, '0')}.mp3`);
    try {
      const stat = await fsp.stat(path);
      return { path, size: stat.size };
    } catch {
      throw new NotFoundException({
        message: `Audio Asmaul Husna #${id} belum di-generate`,
        error: 'NOT_FOUND',
      });
    }
  }

  async getAll(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.asmaulHusna.findMany({
      orderBy: { id: 'asc' },
    });
    return ok(rows, 'Daftar 99 Asmaul Husna', { total: rows.length });
  }

  async getById(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.asmaulHusna.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Asmaul Husna #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Asmaul Husna berhasil diambil');
  }

  async getRandom(): Promise<ResponsePayload<unknown>> {
    const count = await this.prisma.asmaulHusna.count();
    if (count === 0) {
      throw new NotFoundException({
        message: 'Belum ada data Asmaul Husna. Jalankan seeding terlebih dahulu.',
        error: 'NOT_FOUND',
      });
    }
    const skip = Math.floor(Math.random() * count);
    const [row] = await this.prisma.asmaulHusna.findMany({ skip, take: 1 });
    return ok(row, 'Asmaul Husna random');
  }
}
