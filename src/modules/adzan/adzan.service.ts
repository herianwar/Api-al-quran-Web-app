import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';

/** Self-hosted adzan recordings. Files live on our own disk and are streamed
 *  through /adzan/:id/audio — the upstream CDN origin (Adzan.sumberUrl) is kept
 *  in the DB only for re-seeding and is never returned to clients. */
const AUDIO_DIR = join(__dirname, '..', '..', '..', 'data', 'audio-adzan');

@Injectable()
export class AdzanService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(jenis?: string): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.adzan.findMany({
      where: jenis ? { jenis } : undefined,
      orderBy: { urutan: 'asc' },
      select: {
        id: true,
        slug: true,
        judul: true,
        muadzin: true,
        lokasi: true,
        jenis: true,
        durasi: true,
        ukuran: true,
        urutan: true,
      },
    });
    return ok(rows, 'Daftar audio adzan', { total: rows.length });
  }

  async getById(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.adzan.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        judul: true,
        muadzin: true,
        lokasi: true,
        jenis: true,
        durasi: true,
        ukuran: true,
        urutan: true,
      },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Adzan #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Audio adzan berhasil diambil');
  }

  /** Resolve the on-disk MP3 for an adzan row, validating it still exists. */
  async getAudioFile(id: number): Promise<{ path: string; size: number }> {
    const row = await this.prisma.adzan.findUnique({
      where: { id },
      select: { file: true },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Adzan #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const path = join(AUDIO_DIR, row.file);
    try {
      const stat = await fsp.stat(path);
      return { path, size: stat.size };
    } catch {
      throw new NotFoundException({
        message: `Audio adzan #${id} belum tersedia. Jalankan seeding adzan.`,
        error: 'NOT_FOUND',
      });
    }
  }
}
