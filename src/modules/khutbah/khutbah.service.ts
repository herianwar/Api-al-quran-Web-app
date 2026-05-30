import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { KhutbahQueryDto } from './dto/khutbah.dto';

const SEED_PATH = join(__dirname, '..', '..', '..', 'data', 'khutbah.json');

interface SeedItem {
  slug: string;
  judul: string;
  tema?: string;
  pembuka?: string;
  isi: string;
  penutup?: string;
  sumber?: string;
}

@Injectable()
export class KhutbahService implements OnModuleInit {
  private readonly logger = new Logger(KhutbahService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.khutbah.count();
      if (count > 0) return;
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const items: SeedItem[] = JSON.parse(raw);
      for (const it of items) {
        await this.prisma.khutbah.upsert({
          where: { slug: it.slug },
          update: {
            judul: it.judul,
            tema: it.tema ?? null,
            pembuka: it.pembuka ?? null,
            isi: it.isi,
            penutup: it.penutup ?? null,
            sumber: it.sumber ?? null,
          },
          create: {
            slug: it.slug,
            judul: it.judul,
            tema: it.tema ?? null,
            pembuka: it.pembuka ?? null,
            isi: it.isi,
            penutup: it.penutup ?? null,
            sumber: it.sumber ?? null,
          },
        });
      }
      this.logger.log(`Seeded ${items.length} khutbah`);
    } catch (err) {
      this.logger.warn(`Auto-seed khutbah gagal: ${(err as Error).message}`);
    }
  }

  async list(query: KhutbahQueryDto): Promise<ResponsePayload<unknown>> {
    const { skip, take } = paginationArgs(query);
    const where = {
      ...(query.tema ? { tema: query.tema } : {}),
      ...(query.q
        ? {
            OR: [
              { judul: { contains: query.q, mode: 'insensitive' as const } },
              { tema: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.khutbah.count({ where }),
      this.prisma.khutbah.findMany({
        where,
        skip,
        take,
        orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          slug: true,
          judul: true,
          tema: true,
          tanggal: true,
          sumber: true,
          createdAt: true,
        },
      }),
    ]);
    return ok(rows, 'Daftar khutbah Jumat', paginationMeta(query, total));
  }

  async listTemas(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.khutbah.groupBy({
      by: ['tema'],
      _count: { tema: true },
      where: { tema: { not: null } },
    });
    const items = rows
      .filter((r) => r.tema)
      .map((r) => ({ tema: r.tema as string, total: r._count.tema }))
      .sort((a, b) => b.total - a.total);
    return ok(items, 'Daftar tema khutbah', { total: items.length });
  }

  async getBySlug(slug: string): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.khutbah.findUnique({ where: { slug } });
    if (!row) {
      throw new NotFoundException({
        message: `Khutbah "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Khutbah berhasil diambil');
  }

  async getRandom(): Promise<ResponsePayload<unknown>> {
    const count = await this.prisma.khutbah.count();
    if (count === 0) {
      throw new NotFoundException({
        message: 'Belum ada khutbah',
        error: 'NOT_FOUND',
      });
    }
    const skip = Math.floor(Math.random() * count);
    const [row] = await this.prisma.khutbah.findMany({ skip, take: 1 });
    return ok(row, 'Khutbah random');
  }
}
