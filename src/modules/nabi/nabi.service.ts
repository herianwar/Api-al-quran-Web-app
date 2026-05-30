import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';

const SEED_PATH = join(__dirname, '..', '..', '..', 'data', 'nabi.json');

interface SeedItem {
  urutan: number;
  slug: string;
  nama: string;
  namaArab: string;
  gelar?: string;
  periode?: string;
  ringkasan: string;
  kisah: string;
  ayatRujukan?: { surah: number; ayat: number; catatan?: string }[];
}

@Injectable()
export class NabiService implements OnModuleInit {
  private readonly logger = new Logger(NabiService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.nabi.count();
      if (count >= 25) return;
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const items: SeedItem[] = JSON.parse(raw);
      for (const it of items) {
        await this.prisma.nabi.upsert({
          where: { urutan: it.urutan },
          update: {
            slug: it.slug,
            nama: it.nama,
            namaArab: it.namaArab,
            gelar: it.gelar ?? null,
            periode: it.periode ?? null,
            ringkasan: it.ringkasan,
            kisah: it.kisah,
            ayatRujukan: (it.ayatRujukan ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
          create: {
            urutan: it.urutan,
            slug: it.slug,
            nama: it.nama,
            namaArab: it.namaArab,
            gelar: it.gelar ?? null,
            periode: it.periode ?? null,
            ringkasan: it.ringkasan,
            kisah: it.kisah,
            ayatRujukan: (it.ayatRujukan ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });
      }
      this.logger.log(`Seeded ${items.length} nabi`);
    } catch (err) {
      this.logger.warn(`Auto-seed nabi gagal: ${(err as Error).message}`);
    }
  }

  async getAll(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.nabi.findMany({
      orderBy: { urutan: 'asc' },
      select: {
        id: true,
        urutan: true,
        slug: true,
        nama: true,
        namaArab: true,
        gelar: true,
        periode: true,
        ringkasan: true,
      },
    });
    return ok(rows, 'Daftar 25 Nabi', { total: rows.length });
  }

  async getBySlug(slug: string): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.nabi.findUnique({ where: { slug } });
    if (!row) {
      throw new NotFoundException({
        message: `Nabi "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Kisah nabi berhasil diambil');
  }

  async getByUrutan(urutan: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.nabi.findUnique({ where: { urutan } });
    if (!row) {
      throw new NotFoundException({
        message: `Nabi urutan ${urutan} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Kisah nabi berhasil diambil');
  }
}
