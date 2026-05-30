import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  PaginationQueryDto,
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HadithListQueryDto,
  HadithSearchQueryDto,
} from './dto/hadith-query.dto';

@Injectable()
export class HadithService {
  constructor(private readonly prisma: PrismaService) {}

  async listPerawi(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.perawi.findMany({
      orderBy: { slug: 'asc' },
    });
    return ok(rows, 'Daftar perawi', { total: rows.length });
  }

  async listByPerawi(
    slug: string,
    query: HadithListQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const perawi = await this.prisma.perawi.findUnique({ where: { slug } });
    if (!perawi) {
      throw new NotFoundException({
        message: `Perawi "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const where: Prisma.HadisWhereInput = { perawiSlug: slug };
    const isSearch = !!query.q;
    if (isSearch) {
      where.OR = [
        { arab: { contains: query.q!, mode: 'insensitive' } },
        { terjemahan: { contains: query.q!, mode: 'insensitive' } },
      ];
    }

    // Skip COUNT(*) for full-text search — the trigram-index recheck is the
    // slow path. Fetch limit+1 instead and compute hasMore from there. Static
    // per-perawi browsing keeps the exact count (perawi.total) for nice UI.
    if (isSearch) {
      const { skip, take } = paginationArgs(query);
      const rows = await this.prisma.hadis.findMany({
        where,
        orderBy: { nomor: 'asc' },
        skip,
        take: take + 1,
      });
      const hasMore = rows.length > take;
      const trimmed = hasMore ? rows.slice(0, take) : rows;
      return ok(trimmed, `Hadis HR. ${perawi.nama}`, {
        page: query.page,
        limit: query.limit,
        hasMore,
        perawi: { slug: perawi.slug, nama: perawi.nama, total: perawi.total },
      });
    }

    const rows = await this.prisma.hadis.findMany({
      where,
      orderBy: { nomor: 'asc' },
      ...paginationArgs(query),
    });
    return ok(rows, `Hadis HR. ${perawi.nama}`, {
      ...paginationMeta(query, perawi.total),
      perawi: { slug: perawi.slug, nama: perawi.nama, total: perawi.total },
    });
  }

  async getByNomor(
    slug: string,
    nomor: number,
  ): Promise<ResponsePayload<unknown>> {
    const hadis = await this.prisma.hadis.findUnique({
      where: { perawiSlug_nomor: { perawiSlug: slug, nomor } },
      include: { perawi: true },
    });
    if (!hadis) {
      throw new NotFoundException({
        message: `Hadis HR. ${slug} no.${nomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(hadis, 'Hadis berhasil diambil');
  }

  async getRandom(slug?: string): Promise<ResponsePayload<unknown>> {
    const where: Prisma.HadisWhereInput = slug ? { perawiSlug: slug } : {};
    const count = await this.prisma.hadis.count({ where });
    if (count === 0) {
      throw new NotFoundException({
        message: 'Belum ada data hadis. Jalankan seeding terlebih dahulu.',
        error: 'NOT_FOUND',
      });
    }
    const skip = Math.floor(Math.random() * count);
    const [hadis] = await this.prisma.hadis.findMany({
      where,
      include: { perawi: true },
      skip,
      take: 1,
    });
    if (!hadis) {
      throw new NotFoundException({
        message: 'Tidak ada hadis yang tersedia',
        error: 'NOT_FOUND',
      });
    }
    return ok(hadis, 'Hadis random berhasil diambil');
  }

  async search(query: HadithSearchQueryDto): Promise<ResponsePayload<unknown>> {
    const where: Prisma.HadisWhereInput = {
      OR: [
        { arab: { contains: query.q, mode: 'insensitive' } },
        { terjemahan: { contains: query.q, mode: 'insensitive' } },
      ],
    };
    if (query.perawi) where.perawiSlug = query.perawi;
    // Same hasMore-trick as listByPerawi search: avoid the expensive COUNT(*)
    // recheck on 38k rows. UI uses {page, hasMore} for navigation.
    const { skip, take } = paginationArgs(query);
    const rows = await this.prisma.hadis.findMany({
      where,
      include: { perawi: { select: { slug: true, nama: true } } },
      orderBy: [{ perawiSlug: 'asc' }, { nomor: 'asc' }],
      skip,
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const trimmed = hasMore ? rows.slice(0, take) : rows;
    return ok(trimmed, `Hasil pencarian "${query.q}"`, {
      page: query.page,
      limit: query.limit,
      hasMore,
      query: query.q,
      perawi: query.perawi,
    });
  }
}
