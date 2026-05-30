import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  PaginationQueryDto,
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';

export interface DoaInput {
  judul: string;
  arab: string;
  latin?: string;
  terjemah: string;
  sumber?: string | null;
  grup?: string | null;
  tag?: string | null;
}

export interface TopicInput {
  slug: string;
  nama: string;
  urutan?: number;
  deskripsi?: string | null;
}

export interface TopicAyatInput {
  surahNomor: number;
  nomorAyat: number;
  catatan?: string | null;
}

/**
 * CRUD untuk konten yang biasa di-edit admin: Doa & Topic. Setiap mutasi
 * di-log ke audit + invalidate cache Redis terkait.
 */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  // ─── DOA ──────────────────────────────────────────────────────────

  async listDoa(
    pagination: PaginationQueryDto,
    q?: string,
  ): Promise<ResponsePayload<unknown>> {
    const where = q
      ? {
          OR: [
            { judul: { contains: q, mode: 'insensitive' as const } },
            { terjemah: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const { skip, take } = paginationArgs(pagination);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.doa.count({ where }),
      this.prisma.doa.findMany({
        where,
        skip,
        take,
        // Newest first so a just-created doa lands at the top of page 1.
        orderBy: { id: 'desc' },
      }),
    ]);
    return ok(rows, 'Doa', paginationMeta(pagination, total));
  }

  async createDoa(
    input: DoaInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const created = await this.prisma.doa.create({
      data: {
        judul: input.judul,
        arab: input.arab,
        latin: input.latin ?? '',
        terjemah: input.terjemah,
        sumber: input.sumber ?? null,
        grup: input.grup ?? null,
        tag: input.tag ?? null,
      },
    });
    await this.invalidateDoaCache();
    await this.audit.log({
      action: 'content.doa.create',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `doa:${created.id}`,
      metadata: { judul: created.judul },
    });
    return ok(created, 'Doa dibuat');
  }

  async updateDoa(
    id: number,
    input: DoaInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const updated = await this.prisma.doa
      .update({
        where: { id },
        data: {
          judul: input.judul,
          arab: input.arab,
          latin: input.latin ?? '',
          terjemah: input.terjemah,
          sumber: input.sumber ?? null,
          grup: input.grup ?? null,
          tag: input.tag ?? null,
        },
      })
      .catch(() => null);
    if (!updated) {
      throw new NotFoundException({
        message: `Doa ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.invalidateDoaCache();
    await this.audit.log({
      action: 'content.doa.update',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `doa:${id}`,
    });
    return ok(updated, 'Doa diperbarui');
  }

  async deleteDoa(
    id: number,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const deleted = await this.prisma.doa
      .delete({ where: { id } })
      .catch(() => null);
    if (!deleted) {
      throw new NotFoundException({
        message: `Doa ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.invalidateDoaCache();
    await this.audit.log({
      action: 'content.doa.delete',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `doa:${id}`,
      metadata: { judul: deleted.judul },
    });
    return ok({ deleted: true }, 'Doa dihapus');
  }

  private async invalidateDoaCache(): Promise<void> {
    await this.redis.del('doa:all');
    await this.redis.delByPattern('doa:*');
  }

  // ─── TOPIC ────────────────────────────────────────────────────────

  /**
   * Translate a Prisma unique-constraint violation on `slug` into a friendly
   * 409 (otherwise it surfaces as a raw 500 leaking internals). Re-throws
   * anything else unchanged.
   */
  private mapSlugConflict(e: unknown, slug: string): unknown {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException({
        message: `Slug "${slug}" sudah dipakai topik lain`,
        error: 'CONFLICT',
      });
    }
    return e;
  }

  async listTopics(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.topic.findMany({
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
      select: {
        id: true,
        slug: true,
        nama: true,
        deskripsi: true,
        urutan: true,
        _count: { select: { ayatLinks: true } },
      },
    });
    return ok(rows, 'Topik', { total: rows.length });
  }

  async getTopic(slug: string): Promise<ResponsePayload<unknown>> {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      include: {
        ayatLinks: {
          orderBy: [
            { ayat: { surah: { nomor: 'asc' } } },
            { ayat: { nomorAyat: 'asc' } },
          ],
          select: {
            id: true,
            catatan: true,
            ayat: {
              select: {
                id: true,
                nomorAyat: true,
                teksIndonesia: true,
                surah: { select: { nomor: true, namaLatin: true } },
              },
            },
          },
        },
      },
    });
    if (!topic) {
      throw new NotFoundException({
        message: `Topik "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(topic, 'Detail topik');
  }

  async createTopic(
    input: TopicInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const created = await this.prisma.topic
      .create({
        data: {
          slug: input.slug,
          nama: input.nama,
          urutan: input.urutan ?? 100,
          deskripsi: input.deskripsi ?? null,
        },
      })
      .catch((e) => {
        throw this.mapSlugConflict(e, input.slug);
      });
    await this.redis.del('topic:list');
    await this.audit.log({
      action: 'content.topic.create',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `topic:${created.slug}`,
    });
    return ok(created, 'Topik dibuat');
  }

  async updateTopic(
    id: number,
    input: TopicInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const updated = await this.prisma.topic
      .update({
        where: { id },
        data: {
          slug: input.slug,
          nama: input.nama,
          urutan: input.urutan ?? 100,
          deskripsi: input.deskripsi ?? null,
        },
      })
      .catch((e) => {
        // P2025 = record not found → 404; P2002 (duplicate slug) → 409.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2025'
        ) {
          return null;
        }
        throw this.mapSlugConflict(e, input.slug);
      });
    if (!updated) {
      throw new NotFoundException({
        message: `Topik ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.redis.del('topic:list');
    await this.audit.log({
      action: 'content.topic.update',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `topic:${updated.slug}`,
    });
    return ok(updated, 'Topik diperbarui');
  }

  async deleteTopic(
    id: number,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const deleted = await this.prisma.topic
      .delete({ where: { id } })
      .catch(() => null);
    if (!deleted) {
      throw new NotFoundException({
        message: `Topik ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.redis.del('topic:list');
    await this.audit.log({
      action: 'content.topic.delete',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `topic:${deleted.slug}`,
    });
    return ok({ deleted: true }, 'Topik dihapus');
  }

  async addAyatToTopic(
    topicId: number,
    input: TopicAyatInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const surah = await this.prisma.surah.findUnique({
      where: { nomor: input.surahNomor },
      select: { id: true },
    });
    if (!surah) {
      throw new NotFoundException({
        message: `Surat ${input.surahNomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const ayat = await this.prisma.ayat.findUnique({
      where: {
        surahId_nomorAyat: { surahId: surah.id, nomorAyat: input.nomorAyat },
      },
      select: { id: true },
    });
    if (!ayat) {
      throw new NotFoundException({
        message: `Ayat ${input.surahNomor}:${input.nomorAyat} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const link = await this.prisma.topicAyat.upsert({
      where: { topicId_ayatId: { topicId, ayatId: ayat.id } },
      create: { topicId, ayatId: ayat.id, catatan: input.catatan ?? null },
      update: { catatan: input.catatan ?? null },
    });
    await this.redis.del('topic:list');
    await this.audit.log({
      action: 'content.topic.add_ayat',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `topic:${topicId}`,
      metadata: { surah: input.surahNomor, ayat: input.nomorAyat },
    });
    return ok(link, 'Ayat ditambahkan ke topik');
  }

  async removeAyatFromTopic(
    linkId: number,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const deleted = await this.prisma.topicAyat
      .delete({ where: { id: linkId } })
      .catch(() => null);
    if (!deleted) {
      throw new NotFoundException({
        message: `Link ${linkId} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.redis.del('topic:list');
    await this.audit.log({
      action: 'content.topic.remove_ayat',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `topic_ayat:${linkId}`,
    });
    return ok({ deleted: true }, 'Ayat dihapus dari topik');
  }

  // ═════════════════════════════════════════════════════════════════════
  // KHUTBAH JUMAT
  // ═════════════════════════════════════════════════════════════════════

  async listKhutbah(
    pagination: PaginationQueryDto,
    q?: string,
    tema?: string,
  ): Promise<ResponsePayload<unknown>> {
    const where: Prisma.KhutbahWhereInput = {
      ...(tema ? { tema } : {}),
      ...(q
        ? {
            OR: [
              { judul: { contains: q, mode: 'insensitive' as const } },
              { tema: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const { skip, take } = paginationArgs(pagination);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.khutbah.count({ where }),
      this.prisma.khutbah.findMany({
        where,
        skip,
        take,
        orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return ok(rows, 'Khutbah', paginationMeta(pagination, total));
  }

  async getKhutbah(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.khutbah.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Khutbah ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Khutbah');
  }

  async createKhutbah(
    input: Prisma.KhutbahCreateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const created = await this.prisma.khutbah.create({ data: input });
      await this.audit.log({
        action: 'content.khutbah.create',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `khutbah:${created.id}`,
        metadata: { slug: created.slug, judul: created.judul },
      });
      return ok(created, 'Khutbah dibuat');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          message: `Slug "${input.slug}" sudah ada`,
          error: 'CONFLICT',
        });
      }
      throw e;
    }
  }

  async updateKhutbah(
    id: number,
    input: Prisma.KhutbahUpdateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const updated = await this.prisma.khutbah.update({
        where: { id },
        data: input,
      });
      await this.audit.log({
        action: 'content.khutbah.update',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `khutbah:${id}`,
      });
      return ok(updated, 'Khutbah diperbarui');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Khutbah ${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          message: `Slug sudah dipakai khutbah lain`,
          error: 'CONFLICT',
        });
      }
      throw e;
    }
  }

  async deleteKhutbah(
    id: number,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const deleted = await this.prisma.khutbah
      .delete({ where: { id } })
      .catch(() => null);
    if (!deleted) {
      throw new NotFoundException({
        message: `Khutbah ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.audit.log({
      action: 'content.khutbah.delete',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `khutbah:${id}`,
      metadata: { slug: deleted.slug },
    });
    return ok({ deleted: true }, 'Khutbah dihapus');
  }

  // ═════════════════════════════════════════════════════════════════════
  // HADIS QUDSI
  // ═════════════════════════════════════════════════════════════════════

  async listHadisQudsi(
    pagination: PaginationQueryDto,
    q?: string,
  ): Promise<ResponsePayload<unknown>> {
    const where: Prisma.HadisQudsiWhereInput = q
      ? {
          OR: [
            { judul: { contains: q, mode: 'insensitive' as const } },
            { terjemahan: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const { skip, take } = paginationArgs(pagination);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.hadisQudsi.count({ where }),
      this.prisma.hadisQudsi.findMany({
        where,
        skip,
        take,
        orderBy: { nomor: 'asc' },
      }),
    ]);
    return ok(rows, 'Hadis Qudsi', paginationMeta(pagination, total));
  }

  async getHadisQudsi(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.hadisQudsi.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Hadis qudsi ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Hadis Qudsi');
  }

  async createHadisQudsi(
    input: Prisma.HadisQudsiCreateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const created = await this.prisma.hadisQudsi.create({ data: input });
      await this.audit.log({
        action: 'content.hadis_qudsi.create',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `hadis_qudsi:${created.id}`,
        metadata: { nomor: created.nomor },
      });
      return ok(created, 'Hadis qudsi dibuat');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          message: `Nomor ${input.nomor} sudah ada`,
          error: 'CONFLICT',
        });
      }
      throw e;
    }
  }

  async updateHadisQudsi(
    id: number,
    input: Prisma.HadisQudsiUpdateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const updated = await this.prisma.hadisQudsi.update({
        where: { id },
        data: input,
      });
      await this.audit.log({
        action: 'content.hadis_qudsi.update',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `hadis_qudsi:${id}`,
      });
      return ok(updated, 'Hadis qudsi diperbarui');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Hadis qudsi ${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'Nomor sudah dipakai hadis qudsi lain',
          error: 'CONFLICT',
        });
      }
      throw e;
    }
  }

  async deleteHadisQudsi(
    id: number,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const deleted = await this.prisma.hadisQudsi
      .delete({ where: { id } })
      .catch(() => null);
    if (!deleted) {
      throw new NotFoundException({
        message: `Hadis qudsi ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.audit.log({
      action: 'content.hadis_qudsi.delete',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `hadis_qudsi:${id}`,
      metadata: { nomor: deleted.nomor },
    });
    return ok({ deleted: true }, 'Hadis qudsi dihapus');
  }

  // ═════════════════════════════════════════════════════════════════════
  // SIRAH NABAWI
  // ═════════════════════════════════════════════════════════════════════

  async listSirah(
    pagination: PaginationQueryDto,
    q?: string,
  ): Promise<ResponsePayload<unknown>> {
    const where: Prisma.SirahWhereInput = q
      ? { judul: { contains: q, mode: 'insensitive' as const } }
      : {};
    const { skip, take } = paginationArgs(pagination);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sirah.count({ where }),
      this.prisma.sirah.findMany({
        where,
        skip,
        take,
        orderBy: { urutan: 'asc' },
      }),
    ]);
    return ok(rows, 'Sirah', paginationMeta(pagination, total));
  }

  async getSirah(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.sirah.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Sirah ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Sirah');
  }

  async createSirah(
    input: Prisma.SirahCreateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const created = await this.prisma.sirah.create({ data: input });
      await this.audit.log({
        action: 'content.sirah.create',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `sirah:${created.id}`,
        metadata: { slug: created.slug, judul: created.judul },
      });
      return ok(created, 'Sirah dibuat');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          message: `Slug "${input.slug}" sudah ada`,
          error: 'CONFLICT',
        });
      }
      throw e;
    }
  }

  async updateSirah(
    id: number,
    input: Prisma.SirahUpdateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const updated = await this.prisma.sirah.update({
        where: { id },
        data: input,
      });
      await this.audit.log({
        action: 'content.sirah.update',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `sirah:${id}`,
      });
      return ok(updated, 'Sirah diperbarui');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Sirah ${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'Slug sudah dipakai sirah lain',
          error: 'CONFLICT',
        });
      }
      throw e;
    }
  }

  async deleteSirah(
    id: number,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const deleted = await this.prisma.sirah
      .delete({ where: { id } })
      .catch(() => null);
    if (!deleted) {
      throw new NotFoundException({
        message: `Sirah ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.audit.log({
      action: 'content.sirah.delete',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `sirah:${id}`,
      metadata: { slug: deleted.slug },
    });
    return ok({ deleted: true }, 'Sirah dihapus');
  }

  // ═════════════════════════════════════════════════════════════════════
  // NABI (edit-only — 25 entries are fixed)
  // ═════════════════════════════════════════════════════════════════════

  async listNabi(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.nabi.findMany({
      orderBy: { urutan: 'asc' },
    });
    return ok(rows, 'Daftar Nabi', { total: rows.length });
  }

  async getNabi(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.nabi.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Nabi ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Nabi');
  }

  async updateNabi(
    id: number,
    input: Prisma.NabiUpdateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const updated = await this.prisma.nabi.update({
        where: { id },
        data: input,
      });
      await this.audit.log({
        action: 'content.nabi.update',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `nabi:${id}`,
      });
      return ok(updated, 'Nabi diperbarui');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Nabi ${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      throw e;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // ASMAUL HUSNA (detail-only — 99 names fixed)
  // ═════════════════════════════════════════════════════════════════════

  async listAsmaulHusna(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.asmaulHusna.findMany({
      orderBy: { id: 'asc' },
    });
    return ok(rows, 'Daftar Asmaul Husna', { total: rows.length });
  }

  async getAsmaulHusna(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.asmaulHusna.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Asmaul Husna ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Asmaul Husna');
  }

  async updateAsmaulHusna(
    id: number,
    input: Prisma.AsmaulHusnaUpdateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const updated = await this.prisma.asmaulHusna.update({
        where: { id },
        data: input,
      });
      await this.audit.log({
        action: 'content.asmaul_husna.update',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `asmaul_husna:${id}`,
      });
      return ok(updated, 'Asmaul Husna diperbarui');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Asmaul Husna ${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      throw e;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // NIAT SHALAT (edit-only — 5 niat fixed)
  // ═════════════════════════════════════════════════════════════════════

  async listNiatShalat(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.niatShalat.findMany({
      orderBy: { urutan: 'asc' },
    });
    return ok(rows, 'Daftar niat shalat', { total: rows.length });
  }

  async getNiatShalat(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.niatShalat.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Niat shalat ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Niat shalat');
  }

  async updateNiatShalat(
    id: number,
    input: Prisma.NiatShalatUpdateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const updated = await this.prisma.niatShalat.update({
        where: { id },
        data: input,
      });
      await this.audit.log({
        action: 'content.niat_shalat.update',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `niat_shalat:${id}`,
      });
      return ok(updated, 'Niat shalat diperbarui');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Niat shalat ${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      throw e;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // BACAAN SHALAT (edit-only — varian per gerakan fixed)
  // ═════════════════════════════════════════════════════════════════════

  async listBacaanShalat(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.bacaanShalat.findMany({
      orderBy: [{ gerakan: 'asc' }, { varian: 'asc' }],
    });
    return ok(rows, 'Bacaan shalat', { total: rows.length });
  }

  async getBacaanShalat(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.bacaanShalat.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Bacaan shalat ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Bacaan shalat');
  }

  async updateBacaanShalat(
    id: number,
    input: Prisma.BacaanShalatUpdateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const updated = await this.prisma.bacaanShalat.update({
        where: { id },
        data: input,
      });
      await this.audit.log({
        action: 'content.bacaan_shalat.update',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `bacaan_shalat:${id}`,
      });
      return ok(updated, 'Bacaan shalat diperbarui');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Bacaan shalat ${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      throw e;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // TAHLIL (full CRUD — admin mungkin tambah bacaan khusus)
  // ═════════════════════════════════════════════════════════════════════

  async listTahlil(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.tahlil.findMany({
      orderBy: { urutan: 'asc' },
    });
    return ok(rows, 'Daftar tahlil', { total: rows.length });
  }

  async getTahlil(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.tahlil.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Tahlil ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Tahlil');
  }

  async createTahlil(
    input: Prisma.TahlilCreateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const created = await this.prisma.tahlil.create({ data: input });
      await this.audit.log({
        action: 'content.tahlil.create',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `tahlil:${created.id}`,
        metadata: { urutan: created.urutan, judul: created.judul },
      });
      return ok(created, 'Tahlil dibuat');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          message: `Urutan ${input.urutan} sudah ada`,
          error: 'CONFLICT',
        });
      }
      throw e;
    }
  }

  async updateTahlil(
    id: number,
    input: Prisma.TahlilUpdateInput,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    try {
      const updated = await this.prisma.tahlil.update({
        where: { id },
        data: input,
      });
      await this.audit.log({
        action: 'content.tahlil.update',
        actorId: actor?.id,
        actorEmail: actor?.email,
        target: `tahlil:${id}`,
      });
      return ok(updated, 'Tahlil diperbarui');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Tahlil ${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'Urutan sudah dipakai tahlil lain',
          error: 'CONFLICT',
        });
      }
      throw e;
    }
  }

  async deleteTahlil(
    id: number,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const deleted = await this.prisma.tahlil
      .delete({ where: { id } })
      .catch(() => null);
    if (!deleted) {
      throw new NotFoundException({
        message: `Tahlil ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.audit.log({
      action: 'content.tahlil.delete',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `tahlil:${id}`,
      metadata: { urutan: deleted.urutan },
    });
    return ok({ deleted: true }, 'Tahlil dihapus');
  }

  // ═════════════════════════════════════════════════════════════════════
  // AYAT SAJDAH (toggle jenis per ayat)
  // ═════════════════════════════════════════════════════════════════════

  async listSajdah(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.ayat.findMany({
      where: { sajdah: { not: null } },
      orderBy: [{ surahId: 'asc' }, { nomorAyat: 'asc' }],
      include: { surah: { select: { nomor: true, namaLatin: true } } },
    });
    return ok(rows, 'Ayat sajdah', { total: rows.length });
  }

  /**
   * Toggle sajdah tag on a single ayat. `jenis` must be "wajibah" | "mukhtalaf"
   * (or empty/null to clear). Ayat is looked up by surahNomor + nomorAyat
   * because the internal ayat.id isn't user-friendly for admins.
   */
  async setSajdah(
    surahNomor: number,
    nomorAyat: number,
    jenis: string | null,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    if (jenis && !['wajibah', 'mukhtalaf'].includes(jenis)) {
      throw new ConflictException({
        message: 'Jenis sajdah harus "wajibah" atau "mukhtalaf" (atau null).',
        error: 'BAD_REQUEST',
      });
    }
    const surah = await this.prisma.surah.findUnique({
      where: { nomor: surahNomor },
      select: { id: true },
    });
    if (!surah) {
      throw new NotFoundException({
        message: `Surah ${surahNomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const updated = await this.prisma.ayat.updateMany({
      where: { surahId: surah.id, nomorAyat },
      data: { sajdah: jenis },
    });
    if (updated.count === 0) {
      throw new NotFoundException({
        message: `Ayat ${surahNomor}:${nomorAyat} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.audit.log({
      action: jenis ? 'content.sajdah.set' : 'content.sajdah.clear',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `ayat:${surahNomor}:${nomorAyat}`,
      metadata: { jenis },
    });
    return ok(
      { surahNomor, nomorAyat, jenis },
      jenis ? 'Sajdah di-set' : 'Sajdah dihapus',
    );
  }
}
