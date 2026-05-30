import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';

const SEED_PATH = join(__dirname, '..', '..', '..', 'data', 'tahlil.json');

interface SeedItem {
  no: number;
  judul: string;
  arab: string;
  id?: string;       // some entries use "id" for the arti
  latin?: string;
  arti?: string;
}

/** Heuristic: tag each tahlil entry into a logical group so the UI can show
 *  collapsible sections (Pembuka, Surat-surat, Tasbih, Doa penutup). */
function inferJenis(judul: string): string {
  const j = judul.toLowerCase();
  if (j.includes('pengantar') || j.includes('al-fatihah') && !j.includes('doa'))
    return 'pembuka';
  if (j.includes('surat al-') || j.includes('ayat kursi')) return 'surat';
  if (j.includes('tahlil') || j.includes('takbir') || j.includes('tasbih'))
    return 'tasbih';
  if (j.includes('shalawat')) return 'shalawat';
  if (j.includes('doa')) return 'doa';
  return 'lain';
}

@Injectable()
export class TahlilService implements OnModuleInit {
  private readonly logger = new Logger(TahlilService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.tahlil.count();
      const raw = await fsp.readFile(SEED_PATH, 'utf-8');
      const items: SeedItem[] = JSON.parse(raw);
      if (count >= items.length) return;
      for (const it of items) {
        const arti = it.arti ?? it.id ?? '';
        await this.prisma.tahlil.upsert({
          where: { urutan: it.no },
          update: {
            judul: it.judul,
            arab: it.arab,
            latin: it.latin ?? null,
            arti,
            jenis: inferJenis(it.judul),
          },
          create: {
            urutan: it.no,
            judul: it.judul,
            arab: it.arab,
            latin: it.latin ?? null,
            arti,
            jenis: inferJenis(it.judul),
          },
        });
      }
      this.logger.log(`Seeded ${items.length} tahlil`);
    } catch (err) {
      this.logger.warn(`Auto-seed tahlil gagal: ${(err as Error).message}`);
    }
  }

  async getAll(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.tahlil.findMany({
      orderBy: { urutan: 'asc' },
    });
    return ok(rows, 'Urutan bacaan tahlil', { total: rows.length });
  }
}
