import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FeedbackService } from '../src/modules/feedback/feedback.service';
import {
  CreateFeedbackDto,
  FeedbackListQueryDto,
} from '../src/modules/feedback/dto/feedback.dto';

/**
 * Service-level coverage for the "Masukan & Pengajuan Fitur" feature:
 *  - CreateFeedbackDto validation (kategori enum, judul/deskripsi length,
 *    optional email format, trimming)
 *  - FeedbackService.create for guest (userId null) and logged-in (userId set)
 *  - admin list filter/search, getById, partial update, stats, delete
 * Mirrors the no-HTTP/no-guards style of auth-nohp.e2e-spec.ts. Runs against
 * quran_test_db (see jest-e2e.lowmem.json / NODE_ENV wiring).
 */
describe('Feedback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: FeedbackService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(FeedbackService);
  });

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.feedback
        .deleteMany({ where: { id: { in: createdIds } } })
        .catch(() => undefined);
    }
    await app.close();
  });

  async function validateDto(input: Record<string, unknown>) {
    const dto = plainToInstance(CreateFeedbackDto, input);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  }

  const base = {
    kategori: 'fitur_baru',
    judul: 'Mode gelap',
    deskripsi: 'Tolong tambahkan dark mode agar mata tidak perih malam hari.',
  };

  // ─── DTO validation ────────────────────────────────────────────────

  it('accepts a valid payload and trims judul/deskripsi', async () => {
    const { dto, errors } = await validateDto({
      ...base,
      judul: '  Mode gelap  ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.judul).toBe('Mode gelap');
  });

  it('rejects an unknown kategori with "Kategori tidak valid"', async () => {
    const { errors } = await validateDto({ ...base, kategori: 'spam' });
    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints ?? {});
    expect(messages).toContain('Kategori tidak valid');
  });

  it('rejects judul shorter than 4 characters', async () => {
    const { errors } = await validateDto({ ...base, judul: 'abc' });
    expect(errors.some((e) => e.property === 'judul')).toBe(true);
  });

  it('rejects deskripsi shorter than 20 characters', async () => {
    const { errors } = await validateDto({ ...base, deskripsi: 'pendek' });
    expect(errors.some((e) => e.property === 'deskripsi')).toBe(true);
  });

  it('rejects a malformed email but allows omitting it', async () => {
    const bad = await validateDto({ ...base, email: 'not-an-email' });
    expect(bad.errors.some((e) => e.property === 'email')).toBe(true);

    const none = await validateDto({ ...base });
    expect(none.errors).toHaveLength(0);
    expect(none.dto.email).toBeUndefined();
  });

  // ─── Service: create ───────────────────────────────────────────────

  it('creates a guest submission with userId null and status "baru"', async () => {
    const res = await service.create(
      plainToInstance(CreateFeedbackDto, { ...base, platform: 'android' }),
      null,
    );
    const created = res.data as { id: string; status: string };
    createdIds.push(created.id);
    expect(created.status).toBe('baru');

    const row = await prisma.feedback.findUnique({
      where: { id: created.id },
    });
    expect(row?.userId).toBeNull();
    expect(row?.platform).toBe('android');
  });

  it('creates a submission attributed to a logged-in user', async () => {
    const user = await prisma.user.create({
      data: {
        email: `feedback-${process.pid}@test.local`,
        passwordHash: 'x',
      },
    });
    try {
      const res = await service.create(
        plainToInstance(CreateFeedbackDto, base),
        user.id,
      );
      const created = res.data as { id: string };
      createdIds.push(created.id);
      const row = await prisma.feedback.findUnique({
        where: { id: created.id },
      });
      expect(row?.userId).toBe(user.id);

      // Admin detail joins the user info.
      const detail = await service.getById(created.id);
      const data = detail.data as { user: { email: string } | null };
      expect(data.user?.email).toBe(user.email);
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
  });

  // ─── Service: admin list / update / stats / delete ─────────────────

  it('lists with kategori filter + search and paginates', async () => {
    const q = plainToInstance(FeedbackListQueryDto, {
      kategori: 'fitur_baru',
      q: 'gelap',
      page: 1,
      limit: 20,
    });
    const res = await service.list(q);
    const rows = res.data as { kategori: string; judul: string }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every((r) => r.kategori === 'fitur_baru')).toBe(true);
    expect(res.meta?.total).toBeGreaterThanOrEqual(1);
  });

  it('partially updates status and catatanAdmin', async () => {
    const created = (
      await service.create(plainToInstance(CreateFeedbackDto, base), null)
    ).data as { id: string };
    createdIds.push(created.id);

    await service.update(created.id, { status: 'dikerjakan' });
    let row = await prisma.feedback.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe('dikerjakan');
    expect(row?.catatanAdmin).toBeNull();

    await service.update(created.id, { catatanAdmin: 'target rilis v1.2' });
    row = await prisma.feedback.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe('dikerjakan'); // unchanged by the partial update
    expect(row?.catatanAdmin).toBe('target rilis v1.2');
  });

  it('stats returns a complete byStatus/byKategori map', async () => {
    const res = await service.stats();
    const data = res.data as {
      total: number;
      byStatus: Record<string, number>;
      byKategori: Record<string, number>;
    };
    expect(typeof data.total).toBe('number');
    for (const key of ['baru', 'ditinjau', 'dikerjakan', 'selesai', 'ditolak']) {
      expect(typeof data.byStatus[key]).toBe('number');
    }
    for (const key of ['fitur_baru', 'bug', 'konten', 'lainnya']) {
      expect(typeof data.byKategori[key]).toBe('number');
    }
  });

  it('getById throws NotFound for a missing id', async () => {
    await expect(
      service.getById('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('deletes a submission', async () => {
    const created = (
      await service.create(plainToInstance(CreateFeedbackDto, base), null)
    ).data as { id: string };
    await service.remove(created.id);
    const row = await prisma.feedback.findUnique({ where: { id: created.id } });
    expect(row).toBeNull();
  });
});
