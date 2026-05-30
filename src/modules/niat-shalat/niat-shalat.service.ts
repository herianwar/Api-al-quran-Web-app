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

const SEED_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'niat-shalat.json',
);

interface SeedItem {
  id: string;
  nama: string;
  arab: string;
  latin: string;
  arti: string;
}

const ORDER: Record<string, number> = {
  niatsubuh: 1,
  niatdzuhur: 2,
  niatashar: 3,
  niatmaghrib: 4,
  niatisya: 5,
};

@Injectable()
export class NiatShalatService implements OnModuleInit {
  private readonly logger = new Logger(NiatShalatService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.niatShalat.count();
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const items: SeedItem[] = JSON.parse(raw);
      if (count >= items.length) return;
      for (const it of items) {
        await this.prisma.niatShalat.upsert({
          where: { slug: it.id },
          update: {
            nama: it.nama,
            arab: it.arab,
            latin: it.latin,
            arti: it.arti,
            urutan: ORDER[it.id] ?? 99,
          },
          create: {
            slug: it.id,
            nama: it.nama,
            arab: it.arab,
            latin: it.latin,
            arti: it.arti,
            urutan: ORDER[it.id] ?? 99,
          },
        });
      }
      this.logger.log(`Seeded ${items.length} niat shalat`);
    } catch (err) {
      this.logger.warn(
        `Auto-seed niat shalat gagal: ${(err as Error).message}`,
      );
    }
  }

  async getAll(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.niatShalat.findMany({
      orderBy: [{ urutan: 'asc' }, { id: 'asc' }],
    });
    return ok(rows, 'Daftar niat shalat', { total: rows.length });
  }

  async getBySlug(slug: string): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.niatShalat.findUnique({ where: { slug } });
    if (!row) {
      throw new NotFoundException({
        message: `Niat shalat "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Niat shalat');
  }
}
