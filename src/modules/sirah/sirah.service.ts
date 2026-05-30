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

const SEED_PATH = join(__dirname, '..', '..', '..', 'data', 'sirah.json');

interface SeedItem {
  slug: string;
  judul: string;
  urutan: number;
  periode?: string;
  isi: string;
}

@Injectable()
export class SirahService implements OnModuleInit {
  private readonly logger = new Logger(SirahService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.sirah.count();
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const items: SeedItem[] = JSON.parse(raw);
      if (count >= items.length) return;
      for (const it of items) {
        await this.prisma.sirah.upsert({
          where: { slug: it.slug },
          update: {
            judul: it.judul,
            urutan: it.urutan,
            periode: it.periode ?? null,
            isi: it.isi,
          },
          create: {
            slug: it.slug,
            judul: it.judul,
            urutan: it.urutan,
            periode: it.periode ?? null,
            isi: it.isi,
          },
        });
      }
      this.logger.log(`Seeded ${items.length} sirah chapters`);
    } catch (err) {
      this.logger.warn(`Auto-seed sirah gagal: ${(err as Error).message}`);
    }
  }

  async getAll(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.sirah.findMany({
      orderBy: { urutan: 'asc' },
      select: {
        id: true,
        slug: true,
        judul: true,
        urutan: true,
        periode: true,
      },
    });
    return ok(rows, 'Daftar bab sirah Nabi ﷺ', { total: rows.length });
  }

  async getBySlug(slug: string): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.sirah.findUnique({ where: { slug } });
    if (!row) {
      throw new NotFoundException({
        message: `Sirah "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Bab sirah berhasil diambil');
  }
}
