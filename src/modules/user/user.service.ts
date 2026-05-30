import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  PaginationQueryDto,
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/device.dto';
import {
  CreateBookmarkDto,
  CreateHafalanDto,
  UpdateProfileDto,
} from './dto/user.dto';

/** Spaced-repetition review interval (days) per level 0..5. */
const REVIEW_INTERVAL_DAYS = [1, 3, 7, 16, 35, 90];
const MAX_LEVEL = 5;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Profile ────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<ResponsePayload<unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nama: true,
        role: true,
        createdAt: true,
        _count: {
          select: { bookmarks: true, hafalan: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException({
        message: 'User tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok(user, 'Profil user');
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ResponsePayload<unknown>> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { nama: dto.nama },
      select: { id: true, email: true, nama: true, role: true },
    });
    return ok(user, 'Profil berhasil diperbarui');
  }

  // ─── Reading progress ───────────────────────────────────────────────

  async getProgress(userId: string): Promise<ResponsePayload<unknown>> {
    const progress = await this.prisma.readingProgress.findUnique({
      where: { userId },
    });
    return ok(progress, 'Posisi baca terakhir');
  }

  async updateProgress(
    userId: string,
    ayatId: number,
  ): Promise<ResponsePayload<unknown>> {
    const ayat = await this.ayatOrThrow(ayatId);
    const progress = await this.prisma.readingProgress.upsert({
      where: { userId },
      create: { userId, surahId: ayat.surahId, ayatId: ayat.id },
      update: { surahId: ayat.surahId, ayatId: ayat.id },
    });
    return ok(progress, 'Posisi baca diperbarui');
  }

  // ─── Bookmarks ──────────────────────────────────────────────────────

  async getBookmarks(
    userId: string,
    pagination: PaginationQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const { skip, take } = paginationArgs(pagination);
    const where = { userId };
    const [total, bookmarks] = await this.prisma.$transaction([
      this.prisma.bookmark.count({ where }),
      this.prisma.bookmark.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          ayat: {
            select: {
              id: true,
              nomorAyat: true,
              teksArab: true,
              teksIndonesia: true,
              surah: { select: { nomor: true, namaLatin: true } },
            },
          },
        },
      }),
    ]);
    return ok(bookmarks, 'Daftar bookmark', paginationMeta(pagination, total));
  }

  async addBookmark(
    userId: string,
    dto: CreateBookmarkDto,
  ): Promise<ResponsePayload<unknown>> {
    await this.ayatOrThrow(dto.ayatId);
    const existing = await this.prisma.bookmark.findUnique({
      where: { userId_ayatId: { userId, ayatId: dto.ayatId } },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Ayat sudah ada di bookmark',
        error: 'CONFLICT',
      });
    }
    const bookmark = await this.prisma.bookmark.create({
      data: { userId, ayatId: dto.ayatId, catatan: dto.catatan },
    });
    return ok(bookmark, 'Bookmark ditambahkan');
  }

  async removeBookmark(
    userId: string,
    id: string,
  ): Promise<ResponsePayload<unknown>> {
    // deleteMany scoped by (id, userId) so a request authenticated as user
    // A can never delete a bookmark owned by user B even by guessing its
    // UUID. count===0 means either it doesn't exist or belongs to someone
    // else — same NotFound either way (avoid leaking existence).
    const result = await this.prisma.bookmark.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        message: 'Bookmark tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok({ deleted: true }, 'Bookmark dihapus');
  }

  // ─── Hafalan + spaced repetition ────────────────────────────────────

  async getHafalan(
    userId: string,
    pagination: PaginationQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const { skip, take } = paginationArgs(pagination);
    const where = { userId };
    const [total, hafalan] = await this.prisma.$transaction([
      this.prisma.hafalan.count({ where }),
      this.prisma.hafalan.findMany({
        where,
        orderBy: { nextReviewAt: 'asc' },
        skip,
        take,
        include: {
          ayat: {
            select: {
              id: true,
              nomorAyat: true,
              teksArab: true,
              surah: { select: { nomor: true, namaLatin: true } },
            },
          },
        },
      }),
    ]);
    return ok(hafalan, 'Daftar hafalan', paginationMeta(pagination, total));
  }

  async addHafalan(
    userId: string,
    dto: CreateHafalanDto,
  ): Promise<ResponsePayload<unknown>> {
    await this.ayatOrThrow(dto.ayatId);
    const existing = await this.prisma.hafalan.findUnique({
      where: { userId_ayatId: { userId, ayatId: dto.ayatId } },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Ayat sudah ditandai dihafal',
        error: 'CONFLICT',
      });
    }
    const hafalan = await this.prisma.hafalan.create({
      data: {
        userId,
        ayatId: dto.ayatId,
        level: 0,
        nextReviewAt: this.nextReview(0),
      },
    });
    return ok(hafalan, 'Ayat ditandai untuk dihafal');
  }

  async getReviewDue(userId: string): Promise<ResponsePayload<unknown>> {
    const due = await this.prisma.hafalan.findMany({
      where: { userId, nextReviewAt: { lte: new Date() } },
      orderBy: { nextReviewAt: 'asc' },
      include: {
        ayat: {
          select: {
            id: true,
            nomorAyat: true,
            teksArab: true,
            teksLatin: true,
            teksIndonesia: true,
            surah: { select: { nomor: true, namaLatin: true } },
          },
        },
      },
    });
    return ok(due, "Ayat yang perlu muraja'ah hari ini", {
      total: due.length,
    });
  }

  async reviewHafalan(
    userId: string,
    id: string,
    remembered: boolean,
  ): Promise<ResponsePayload<unknown>> {
    const hafalan = await this.prisma.hafalan.findFirst({
      where: { id, userId },
    });
    if (!hafalan) {
      throw new NotFoundException({
        message: 'Data hafalan tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    const newLevel = remembered
      ? Math.min(hafalan.level + 1, MAX_LEVEL)
      : Math.max(hafalan.level - 1, 0);
    const updated = await this.prisma.hafalan.update({
      where: { id },
      data: {
        level: newLevel,
        lastReviewAt: new Date(),
        nextReviewAt: this.nextReview(newLevel),
      },
    });
    return ok(updated, "Hasil muraja'ah disimpan");
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private nextReview(level: number): Date {
    // Clamp to valid range as belt-and-suspenders in case DB was tampered
    // with or a future code path forgets to cap level at MAX_LEVEL.
    const safe = Math.max(0, Math.min(level, MAX_LEVEL));
    const days = REVIEW_INTERVAL_DAYS[safe];
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  // ─── Device tokens (push notification targets) ──────────────────────

  async registerDevice(
    userId: string,
    dto: RegisterDeviceDto,
  ): Promise<ResponsePayload<unknown>> {
    // Upsert by unique `token` so the same physical device re-registering
    // (e.g. after re-install) just refreshes the row rather than creating
    // duplicates. If the token previously belonged to another user (rare —
    // FCM re-assigns tokens occasionally), we re-claim it for the current
    // session.
    const row = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceName: dto.deviceName,
      },
      update: {
        userId,
        platform: dto.platform,
        deviceName: dto.deviceName,
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
    return ok(row, 'Device terdaftar untuk push notification');
  }

  async unregisterDevice(
    userId: string,
    token: string,
  ): Promise<ResponsePayload<unknown>> {
    const result = await this.prisma.deviceToken.deleteMany({
      where: { token, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        message: 'Device token tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok({ deleted: true }, 'Device dihapus dari daftar push');
  }

  async listDevices(userId: string): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        lastSeenAt: true,
        createdAt: true,
        // token deliberately omitted — don't leak in list view
      },
    });
    return ok(rows, 'Daftar device', { total: rows.length });
  }

  private async ayatOrThrow(ayatId: number) {
    const ayat = await this.prisma.ayat.findUnique({ where: { id: ayatId } });
    if (!ayat) {
      throw new NotFoundException({
        message: `Ayat dengan id ${ayatId} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ayat;
  }
}
