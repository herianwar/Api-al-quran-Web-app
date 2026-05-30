import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';

const SEED_PATH = join(__dirname, '..', '..', '..', 'data', 'wirid.json');
const GROUP_PREFIX = 'wirid-';
const VALID_TYPES = ['pagi', 'petang'] as const;

type WiridType = (typeof VALID_TYPES)[number];

interface WiridItem {
  judul: string;
  arab: string;
  latin: string;
  terjemah: string;
  sumber: string;
  hitungan?: number;
  urutan: number;
}

@Injectable()
export class WiridService implements OnModuleInit {
  private readonly logger = new Logger(WiridService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const existing = await this.prisma.doa.count({
        where: { grup: { startsWith: GROUP_PREFIX } },
      });
      if (existing > 0) return; // sudah pernah seed
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const data: Record<WiridType, WiridItem[]> = JSON.parse(raw);
      let total = 0;
      for (const type of VALID_TYPES) {
        const items = data[type] ?? [];
        for (const it of items) {
          await this.prisma.doa.create({
            data: {
              judul: it.judul,
              arab: it.arab,
              latin: it.latin,
              terjemah: it.terjemah,
              sumber: it.sumber,
              grup: `${GROUP_PREFIX}${type}`,
              tag: 'wirid',
              urutan: it.urutan,
              hitungan: it.hitungan ?? null,
            },
          });
          total += 1;
        }
      }
      if (total > 0) this.logger.log(`Seeded ${total} wirid items`);
    } catch (err) {
      this.logger.warn(`Auto-seed wirid gagal: ${(err as Error).message}`);
    }
  }

  async byType(type: string): Promise<ResponsePayload<unknown>> {
    if (!VALID_TYPES.includes(type as WiridType)) {
      throw new BadRequestException({
        message: `Tipe wirid harus salah satu dari: ${VALID_TYPES.join(', ')}`,
        error: 'BAD_REQUEST',
      });
    }
    const rows = await this.prisma.doa.findMany({
      where: { grup: `${GROUP_PREFIX}${type}` },
      orderBy: [{ urutan: 'asc' }, { id: 'asc' }],
    });
    return ok(rows, `Wirid ${type}`, { total: rows.length });
  }
}
