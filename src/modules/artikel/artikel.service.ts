import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateArtikelDto,
  CreateKategoriDto,
  ArtikelListQueryDto,
  UpdateArtikelDto,
  UpdateKategoriDto,
} from './dto/artikel.dto';
import {
  estimateReadingMinutes,
  extractArtikelUploadUrls,
  htmlToText,
  sanitizeArticleHtml,
} from './html-sanitize';

/** Where article cover/inline uploads live on disk. Served at /uploads/artikel
 *  via the static-assets mount in main.ts (same scheme as the shop module). */
export const ARTIKEL_UPLOAD_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'uploads',
  'artikel',
);

/** Public fields returned in list responses (no full body — keeps payload light). */
const LIST_SELECT = {
  id: true,
  slug: true,
  judul: true,
  ringkasan: true,
  coverUrl: true,
  coverAlt: true,
  penulis: true,
  status: true,
  isFeatured: true,
  tags: true,
  menitBaca: true,
  views: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, slug: true, nama: true } },
} satisfies Prisma.ArtikelSelect;

@Injectable()
export class ArtikelService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recent (ip→slug) view keys → expiry ms, so a refresh doesn't inflate the
   *  counter. In-memory is fine for the single-instance deployment; entries
   *  self-expire and the map is swept opportunistically. */
  private readonly viewSeen = new Map<string, number>();
  private static readonly VIEW_WINDOW_MS = 30 * 60_000; // 30 min

  /** @returns true if this ip+slug should count as a fresh view. */
  private shouldCountView(ip: string, slug: string): boolean {
    const now = Date.now();
    const key = `${ip || 'anon'}:${slug}`;
    const seen = this.viewSeen.get(key);
    if (seen && seen > now) return false;
    this.viewSeen.set(key, now + ArtikelService.VIEW_WINDOW_MS);
    // Opportunistic sweep so the map can't grow unbounded.
    if (this.viewSeen.size > 5000) {
      for (const [k, exp] of this.viewSeen) {
        if (exp <= now) this.viewSeen.delete(k);
      }
    }
    return true;
  }

  // ─── Kategori ────────────────────────────────────────────────────────

  async listKategori(onlyActive = false): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.artikelKategori.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
      include: {
        _count: {
          select: {
            artikel: onlyActive
              ? { where: { status: 'published' } }
              : true,
          },
        },
      },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        nama: r.nama,
        deskripsi: r.deskripsi,
        urutan: r.urutan,
        isActive: r.isActive,
        jumlahArtikel: r._count.artikel,
      })),
      'Daftar kategori artikel',
    );
  }

  async createKategori(dto: CreateKategoriDto): Promise<ResponsePayload<unknown>> {
    try {
      const row = await this.prisma.artikelKategori.create({ data: dto });
      return ok(row, `Kategori '${row.nama}' dibuat`);
    } catch (err) {
      throw this.mapKnownError(err, `Slug '${dto.slug}'`);
    }
  }

  async updateKategori(
    id: number,
    dto: UpdateKategoriDto,
  ): Promise<ResponsePayload<unknown>> {
    await this.ensureKategori(id);
    const row = await this.prisma.artikelKategori.update({
      where: { id },
      data: dto,
    });
    return ok(row, 'Kategori diperbarui');
  }

  async deleteKategori(id: number): Promise<ResponsePayload<unknown>> {
    await this.ensureKategori(id);
    // FK is ON DELETE SET NULL, so articles survive (become uncategorized).
    await this.prisma.artikelKategori.delete({ where: { id } });
    return ok({ id }, 'Kategori dihapus');
  }

  private async ensureKategori(id: number): Promise<void> {
    const exists = await this.prisma.artikelKategori.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({
        message: `Kategori #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
  }

  // ─── Artikel: list ───────────────────────────────────────────────────

  /** @param publicOnly when true, force status=published (ignores ?status). */
  async list(
    query: ArtikelListQueryDto,
    publicOnly: boolean,
  ): Promise<ResponsePayload<unknown>> {
    const where: Prisma.ArtikelWhereInput = {};

    if (publicOnly) {
      where.status = 'published';
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.kategori) {
      where.category = { slug: query.kategori };
    }
    if (query.tag) {
      where.tags = { has: query.tag };
    }
    if (typeof query.featured === 'boolean') {
      where.isFeatured = query.featured;
    }
    if (query.q) {
      where.OR = [
        { judul: { contains: query.q, mode: 'insensitive' } },
        { ringkasan: { contains: query.q, mode: 'insensitive' } },
        { tags: { has: query.q.toLowerCase() } },
      ];
    }
    if (query.since) {
      const d = new Date(query.since);
      if (!isNaN(d.getTime())) where.updatedAt = { gt: d };
    }

    // Published list ordered by publish date; admin list by recency.
    const orderBy: Prisma.ArtikelOrderByWithRelationInput[] = publicOnly
      ? [{ publishedAt: 'desc' }, { id: 'desc' }]
      : [{ updatedAt: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.artikel.count({ where }),
      this.prisma.artikel.findMany({
        where,
        orderBy,
        select: LIST_SELECT,
        ...paginationArgs(query),
      }),
    ]);

    return ok(rows, 'Daftar artikel', paginationMeta(query, total));
  }

  // ─── Artikel: detail ─────────────────────────────────────────────────

  /** Public detail by slug. Only published articles are visible; increments
   *  the view counter (fire-and-forget) on each successful read. */
  async getBySlug(
    slug: string,
    ip = '',
  ): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.artikel.findFirst({
      where: { slug, status: 'published' },
      include: { category: { select: { id: true, slug: true, nama: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Artikel '${slug}' tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }

    // Count one view per IP per 30-min window (refresh doesn't inflate).
    const counted = this.shouldCountView(ip, slug);
    if (counted) {
      void this.prisma.artikel
        .update({ where: { id: row.id }, data: { views: { increment: 1 } } })
        .catch(() => undefined);
    }

    // Related: same category or shared tag, newest first, excluding self.
    // Falls back to "other recent published" when the article has neither.
    const relatedOr: Prisma.ArtikelWhereInput[] = [];
    if (row.categoryId) relatedOr.push({ categoryId: row.categoryId });
    if (row.tags.length) relatedOr.push({ tags: { hasSome: row.tags } });
    const related = await this.prisma.artikel.findMany({
      where: {
        status: 'published',
        id: { not: row.id },
        ...(relatedOr.length ? { OR: relatedOr } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: 4,
      select: LIST_SELECT,
    });

    return ok(
      { ...row, views: row.views + (counted ? 1 : 0), related },
      'Detail artikel',
    );
  }

  /** Admin detail by id (any status). */
  async getById(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.artikel.findUnique({
      where: { id },
      include: { category: { select: { id: true, slug: true, nama: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Artikel #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Detail artikel');
  }

  // ─── Artikel: create / update / delete ───────────────────────────────

  async create(dto: CreateArtikelDto): Promise<ResponsePayload<unknown>> {
    const konten = sanitizeArticleHtml(dto.konten);
    const ringkasan = dto.ringkasan?.trim() || autoExcerpt(konten);
    const status = dto.status ?? 'draft';

    if (dto.categoryId) await this.ensureKategori(dto.categoryId);

    try {
      const row = await this.prisma.artikel.create({
        data: {
          slug: dto.slug,
          judul: dto.judul,
          ringkasan,
          konten,
          coverUrl: dto.coverUrl,
          coverAlt: dto.coverAlt,
          penulis: dto.penulis,
          status,
          isFeatured: dto.isFeatured ?? false,
          tags: normalizeTags(dto.tags),
          menitBaca: estimateReadingMinutes(konten),
          publishedAt: status === 'published' ? new Date() : null,
          categoryId: dto.categoryId ?? null,
        },
      });
      return ok(row, `Artikel '${row.judul}' dibuat`);
    } catch (err) {
      throw this.mapKnownError(err, `Slug '${dto.slug}'`);
    }
  }

  async update(
    id: number,
    dto: UpdateArtikelDto,
  ): Promise<ResponsePayload<unknown>> {
    const current = await this.prisma.artikel.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException({
        message: `Artikel #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    if (dto.categoryId) await this.ensureKategori(dto.categoryId);

    const data: Prisma.ArtikelUpdateInput = {};
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.judul !== undefined) data.judul = dto.judul;
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl || null;
    if (dto.coverAlt !== undefined) data.coverAlt = dto.coverAlt || null;
    if (dto.penulis !== undefined) data.penulis = dto.penulis || null;
    if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
    if (dto.tags !== undefined) data.tags = normalizeTags(dto.tags);

    if (dto.konten !== undefined) {
      const konten = sanitizeArticleHtml(dto.konten);
      data.konten = konten;
      data.menitBaca = estimateReadingMinutes(konten);
      // Refresh auto-excerpt only when the admin left ringkasan untouched/empty.
      if (dto.ringkasan === undefined && !current.ringkasan) {
        data.ringkasan = autoExcerpt(konten);
      }
    }
    if (dto.ringkasan !== undefined) {
      data.ringkasan =
        dto.ringkasan.trim() ||
        autoExcerpt(
          dto.konten !== undefined ? sanitizeArticleHtml(dto.konten) : current.konten,
        );
    }

    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }

    // Status transitions stamp publishedAt the first time it goes live.
    if (dto.status !== undefined && dto.status !== current.status) {
      data.status = dto.status;
      if (dto.status === 'published' && !current.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    try {
      const row = await this.prisma.artikel.update({ where: { id }, data });
      // Clean up inline images dropped from the body in this edit, plus the
      // previous cover when it was replaced/cleared.
      const removed: string[] = [];
      if (typeof data.konten === 'string') {
        const before = extractArtikelUploadUrls(current.konten);
        const after = new Set(extractArtikelUploadUrls(data.konten));
        removed.push(...before.filter((u) => !after.has(u)));
      }
      if (
        dto.coverUrl !== undefined &&
        current.coverUrl &&
        current.coverUrl !== row.coverUrl
      ) {
        removed.push(current.coverUrl);
      }
      void this.cleanupOrphans(removed);
      return ok(row, 'Artikel diperbarui');
    } catch (err) {
      throw this.mapKnownError(err, `Slug '${dto.slug ?? current.slug}'`);
    }
  }

  async remove(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.artikel.findUnique({
      where: { id },
      select: { id: true, coverUrl: true, konten: true },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Artikel #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.prisma.artikel.delete({ where: { id } });
    // Best-effort cleanup of the cover + every inline image, but only files no
    // other article still references (cleanupOrphans checks before unlinking).
    const urls = [...extractArtikelUploadUrls(row.konten)];
    if (row.coverUrl) urls.push(row.coverUrl);
    void this.cleanupOrphans(urls);
    return ok({ id }, 'Artikel dihapus');
  }

  /** Unlink uploaded files that no remaining article references (body or
   *  cover). Defensive: only touches /uploads/artikel/<safe-name> files. */
  private async cleanupOrphans(urls: string[]): Promise<void> {
    for (const url of new Set(urls)) {
      if (!url || !url.includes('/uploads/artikel/')) continue;
      const path = url.slice(url.indexOf('/uploads/artikel/'));
      const stillUsed = await this.prisma.artikel
        .count({
          where: { OR: [{ konten: { contains: path } }, { coverUrl: path }] },
        })
        .catch(() => 1);
      if (stillUsed === 0) await this.unlinkUpload(path);
    }
  }

  // ─── Uploads ─────────────────────────────────────────────────────────

  /** Register an uploaded file and return its public URL. */
  registerUpload(filename: string): ResponsePayload<{ url: string }> {
    const url = `/uploads/artikel/${filename}`;
    return ok({ url }, 'Gambar diupload');
  }

  private async unlinkUpload(url: string): Promise<void> {
    if (!url.startsWith('/uploads/artikel/')) return;
    const filename = url.slice('/uploads/artikel/'.length);
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return;
    try {
      await fsp.unlink(join(ARTIKEL_UPLOAD_DIR, filename));
    } catch {
      /* file already gone */
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private mapKnownError(err: unknown, subject: string): Error {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException({
        message: `${subject} sudah dipakai`,
        error: 'CONFLICT',
      });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return new NotFoundException({
        message: 'Data tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return err instanceof Error
      ? err
      : new BadRequestException({ message: 'Permintaan gagal', error: 'BAD_REQUEST' });
  }
}

/** Build a ~200-char plain-text excerpt from sanitized HTML. */
function autoExcerpt(html: string): string {
  const t = htmlToText(html);
  if (t.length <= 200) return t;
  const cut = t.slice(0, 200);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Lowercase, trim, dedupe, drop empties. */
function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = t.trim().toLowerCase();
    if (v) seen.add(v);
  }
  return [...seen];
}
