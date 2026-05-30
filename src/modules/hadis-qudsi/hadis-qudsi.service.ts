import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  PaginationQueryDto,
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';

const SEED_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'hadis-qudsi.json',
);

interface SeedItem {
  nomor: number;
  judul?: string | null;
  arab: string;
  terjemahan: string;
  sumber?: string | null;
  kitab?: string | null;
}

@Injectable()
export class HadisQudsiService implements OnModuleInit {
  private readonly logger = new Logger(HadisQudsiService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Auto-seed pada module init kalau tabel masih kosong. Ringan (~40 row)
   * dan idempotent karena seeded lewat upsert per nomor.
   */
  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.hadisQudsi.count();
      if (count > 0) return;
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const items: SeedItem[] = JSON.parse(raw);
      for (const it of items) {
        await this.prisma.hadisQudsi.upsert({
          where: { nomor: it.nomor },
          update: {
            judul: it.judul ?? null,
            arab: it.arab,
            terjemahan: it.terjemahan,
            sumber: it.sumber ?? null,
            kitab: it.kitab ?? null,
          },
          create: {
            nomor: it.nomor,
            judul: it.judul ?? null,
            arab: it.arab,
            terjemahan: it.terjemahan,
            sumber: it.sumber ?? null,
            kitab: it.kitab ?? null,
          },
        });
      }
      this.logger.log(`Seeded ${items.length} hadis qudsi`);
    } catch (err) {
      this.logger.warn(
        `Auto-seed hadis qudsi gagal: ${(err as Error).message}`,
      );
    }
  }

  async getAll(
    pagination: PaginationQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const { skip, take } = paginationArgs(pagination);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.hadisQudsi.count(),
      this.prisma.hadisQudsi.findMany({
        skip,
        take,
        orderBy: { nomor: 'asc' },
      }),
    ]);
    return ok(rows, 'Daftar hadis qudsi', paginationMeta(pagination, total));
  }

  async getRandom(): Promise<ResponsePayload<unknown>> {
    const count = await this.prisma.hadisQudsi.count();
    if (count === 0) {
      throw new NotFoundException({
        message: 'Belum ada data hadis qudsi',
        error: 'NOT_FOUND',
      });
    }
    const skip = Math.floor(Math.random() * count);
    const [row] = await this.prisma.hadisQudsi.findMany({ skip, take: 1 });
    return ok(row, 'Hadis qudsi random');
  }

  async getByNomor(nomor: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.hadisQudsi.findUnique({ where: { nomor } });
    if (!row) {
      throw new NotFoundException({
        message: `Hadis qudsi #${nomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Hadis qudsi berhasil diambil');
  }
}
