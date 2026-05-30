import {
  Injectable,
  Logger,
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
  'bacaan-shalat.json',
);

type Bacaan = {
  arab: string;
  latin?: string;
  arti?: string;
};

interface SeedGroup {
  /** "id" from the source; sometimes the same number repeats for Iftitah/Fatihah.
   *  We re-assign sequential gerakan numbers below. */
  id: number | string;
  nama: string;
  bacaan: Bacaan | Bacaan[];
}

@Injectable()
export class BacaanShalatService implements OnModuleInit {
  private readonly logger = new Logger(BacaanShalatService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.bacaanShalat.count();
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const groups: SeedGroup[] = JSON.parse(raw);

      const total = groups.reduce(
        (acc, g) => acc + (Array.isArray(g.bacaan) ? g.bacaan.length : 1),
        0,
      );
      if (count >= total) return;

      let gerakan = 0;
      for (const g of groups) {
        gerakan += 1;
        const bacaanList = Array.isArray(g.bacaan) ? g.bacaan : [g.bacaan];
        let varian = 0;
        for (const b of bacaanList) {
          varian += 1;
          await this.prisma.bacaanShalat.upsert({
            where: { gerakan_varian: { gerakan, varian } },
            update: {
              nama: g.nama,
              arab: b.arab ?? '',
              latin: b.latin ?? '',
              arti: b.arti ?? '',
            },
            create: {
              gerakan,
              varian,
              nama: g.nama,
              arab: b.arab ?? '',
              latin: b.latin ?? '',
              arti: b.arti ?? '',
            },
          });
        }
      }
      this.logger.log(`Seeded ${total} bacaan shalat (${gerakan} gerakan)`);
    } catch (err) {
      this.logger.warn(
        `Auto-seed bacaan shalat gagal: ${(err as Error).message}`,
      );
    }
  }

  async getAll(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.bacaanShalat.findMany({
      orderBy: [{ gerakan: 'asc' }, { varian: 'asc' }],
    });
    // Group by (gerakan, nama) so the frontend can render one section per gerakan.
    const grouped: Record<
      number,
      {
        gerakan: number;
        nama: string;
        bacaan: {
          varian: number;
          arab: string;
          latin: string;
          arti: string;
        }[];
      }
    > = {};
    for (const r of rows) {
      if (!grouped[r.gerakan]) {
        grouped[r.gerakan] = { gerakan: r.gerakan, nama: r.nama, bacaan: [] };
      }
      grouped[r.gerakan].bacaan.push({
        varian: r.varian,
        arab: r.arab,
        latin: r.latin,
        arti: r.arti,
      });
    }
    return ok(Object.values(grouped), 'Bacaan shalat per gerakan', {
      totalGerakan: Object.keys(grouped).length,
      totalBacaan: rows.length,
    });
  }
}
