import {
  ArgumentsHost,
  ConflictException,
  HttpException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { UpdateHaidPeriodDto } from '../src/modules/muslimah/dto/muslimah.dto';
import { MuslimahService } from '../src/modules/muslimah/muslimah.service';

/**
 * Validasi siklus haid di sisi server (BUG 1 & BUG 2).
 *
 * Gaya sama dengan ibadah.e2e-spec.ts: dipanggil di layer service (tanpa
 * HTTP/auth) supaya ringan di VPS, tapi tetap menembus Prisma + DB sungguhan
 * sehingga transaksi/advisory-lock ikut teruji. Setiap kasus di acceptance
 * criteria punya satu test.
 */
describe('Muslimah — validasi siklus haid (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let muslimah: MuslimahService;
  let userId: string;

  type PeriodShape = {
    data: {
      id: string;
      jenis: string;
      mulai: string;
      selesai: string | null;
      berlangsung: boolean;
      durasiHari: number | null;
      catatan: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
  };

  type StatusShape = {
    data: {
      tanggal: string;
      status: string;
      hariKe: number | null;
      periode: { id: string; jenis: string; berlangsung: boolean } | null;
      ibadah: { sholat: { boleh: boolean } };
    };
  };

  /** Jalankan `fn`, kembalikan HttpException yang dilempar (gagal bila tidak). */
  const expectHttpError = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const err = e as HttpException;
      return {
        status: err.getStatus(),
        body: err.getResponse() as Record<string, unknown>,
      };
    }
    throw new Error('Diharapkan error, tapi request berhasil');
  };

  /** Bersihkan semua periode user agar tiap test mulai dari kondisi kosong. */
  const resetPeriods = () =>
    prisma.haidPeriod.deleteMany({ where: { userId } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    muslimah = app.get(MuslimahService);

    const user = await prisma.user.create({
      data: {
        email: `e2e-muslimah-${Date.now()}@example.test`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.haidPeriod.deleteMany({ where: { userId } });
    await prisma.qadhaPuasa.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  beforeEach(resetPeriods);

  // ── BUG 1: create ────────────────────────────────────────────────────

  it('menolak periode berlangsung kedua dengan 409 + code HAID_ACTIVE_EXISTS', async () => {
    await muslimah.createPeriod(userId, { mulai: '2026-07-28' });

    const err = await expectHttpError(() =>
      muslimah.createPeriod(userId, { mulai: '2026-07-28' }),
    );
    expect(err.status).toBe(409);
    expect(err.body.code).toBe('HAID_ACTIVE_EXISTS');
    expect(String(err.body.message)).toMatch(/berlangsung/i);

    // Tidak ada baris kedua yang tersimpan.
    const rows = await prisma.haidPeriod.findMany({ where: { userId } });
    expect(rows.length).toBe(1);
  });

  it('menolak periode yang beririsan dengan periode lain (409 HAID_OVERLAP)', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    });

    const err = await expectHttpError(() =>
      muslimah.createPeriod(userId, {
        mulai: '2026-06-05',
        selesai: '2026-06-10',
      }),
    );
    expect(err.status).toBe(409);
    expect(err.body.code).toBe('HAID_OVERLAP');
    expect(
      (await prisma.haidPeriod.findMany({ where: { userId } })).length,
    ).toBe(1);
  });

  it('menolak periode yang menelan periode lain seluruhnya (409 HAID_OVERLAP)', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-10',
      selesai: '2026-06-15',
    });

    const err = await expectHttpError(() =>
      muslimah.createPeriod(userId, {
        mulai: '2026-06-01',
        selesai: '2026-06-30',
      }),
    );
    expect(err.status).toBe(409);
    expect(err.body.code).toBe('HAID_OVERLAP');
  });

  it('menolak selesai < mulai dengan 422 + code HAID_INVALID_RANGE', async () => {
    const err = await expectHttpError(() =>
      muslimah.createPeriod(userId, {
        mulai: '2026-06-10',
        selesai: '2026-06-01',
      }),
    );
    expect(err.status).toBe(422);
    expect(err.body.code).toBe('HAID_INVALID_RANGE');
    expect(
      (await prisma.haidPeriod.findMany({ where: { userId } })).length,
    ).toBe(0);
  });

  it('menerima periode selesai yang seluruhnya sebelum periode aktif (201)', async () => {
    // Periode aktif mulai 2026-07-28 (terbuka sampai +∞).
    await muslimah.createPeriod(userId, { mulai: '2026-07-28' });

    const res = (await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    })) as PeriodShape;

    expect(res.data.mulai).toBe('2026-06-01');
    expect(res.data.selesai).toBe('2026-06-07');
    expect(res.data.berlangsung).toBe(false);
    expect(res.data.durasiHari).toBe(7);
    expect(
      (await prisma.haidPeriod.findMany({ where: { userId } })).length,
    ).toBe(2);
  });

  it('menerima periode berurutan tanpa irisan (H+1 setelah yang lain selesai)', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    });
    const res = (await muslimah.createPeriod(userId, {
      mulai: '2026-06-08',
      selesai: '2026-06-12',
    })) as PeriodShape;

    expect(res.data.berlangsung).toBe(false);
    expect(
      (await prisma.haidPeriod.findMany({ where: { userId } })).length,
    ).toBe(2);
  });

  it('menolak periode yang menempel di hari yang sama (batas inklusif)', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    });
    // Mulai persis di hari terakhir periode sebelumnya → beririsan.
    const err = await expectHttpError(() =>
      muslimah.createPeriod(userId, {
        mulai: '2026-06-07',
        selesai: '2026-06-12',
      }),
    );
    expect(err.status).toBe(409);
    expect(err.body.code).toBe('HAID_OVERLAP');
  });

  it('bentuk response sukses tidak berubah (kontrak yang dipakai app)', async () => {
    const res = (await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-05',
      catatan: 'tes',
    })) as PeriodShape;
    expect(Object.keys(res.data).sort()).toEqual(
      [
        'berlangsung',
        'catatan',
        'createdAt',
        'durasiHari',
        'id',
        'jenis',
        'mulai',
        'qadhaRamadhan',
        'selesai',
        'updatedAt',
      ].sort(),
    );
  });

  // ── BUG 1: update ────────────────────────────────────────────────────

  it('PUT yang menyebabkan overlap ditolak 409 dan tidak menulis apa pun', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    });
    const kedua = (await muslimah.createPeriod(userId, {
      mulai: '2026-06-20',
      selesai: '2026-06-25',
    })) as PeriodShape;

    const err = await expectHttpError(() =>
      muslimah.updatePeriod(userId, kedua.data.id, { mulai: '2026-06-05' }),
    );
    expect(err.status).toBe(409);
    expect(err.body.code).toBe('HAID_OVERLAP');

    const row = await prisma.haidPeriod.findUnique({
      where: { id: kedua.data.id },
    });
    expect(row?.mulai.toISOString().slice(0, 10)).toBe('2026-06-20');
  });

  it('PUT untuk menutup periode (set selesai) berhasil', async () => {
    const aktif = (await muslimah.createPeriod(userId, {
      mulai: '2026-07-01',
    })) as PeriodShape;
    expect(aktif.data.berlangsung).toBe(true);

    const res = (await muslimah.updatePeriod(userId, aktif.data.id, {
      selesai: '2026-07-07',
    })) as PeriodShape;
    expect(res.data.selesai).toBe('2026-07-07');
    expect(res.data.berlangsung).toBe(false);
    expect(res.data.durasiHari).toBe(7);

    // Setelah ditutup, periode baru boleh dibuat.
    const baru = (await muslimah.createPeriod(userId, {
      mulai: '2026-07-28',
    })) as PeriodShape;
    expect(baru.data.berlangsung).toBe(true);
  });

  it('PUT yang tidak menggeser tanggal tidak dianggap bentrok dengan dirinya sendiri', async () => {
    const p = (await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    })) as PeriodShape;

    const res = (await muslimah.updatePeriod(userId, p.data.id, {
      catatan: 'catatan baru',
    })) as PeriodShape;
    expect(res.data.catatan).toBe('catatan baru');
    expect(res.data.mulai).toBe('2026-06-01');
    expect(res.data.selesai).toBe('2026-06-07');
  });

  it('PUT selesai < mulai ditolak 422 HAID_INVALID_RANGE', async () => {
    const p = (await muslimah.createPeriod(userId, {
      mulai: '2026-06-10',
    })) as PeriodShape;

    const err = await expectHttpError(() =>
      muslimah.updatePeriod(userId, p.data.id, { selesai: '2026-06-01' }),
    );
    expect(err.status).toBe(422);
    expect(err.body.code).toBe('HAID_INVALID_RANGE');
  });

  it('PUT membuka kembali periode (selesai=null) ditolak bila sudah ada yang berlangsung', async () => {
    const lama = (await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    })) as PeriodShape;
    await muslimah.createPeriod(userId, { mulai: '2026-07-28' });

    const err = await expectHttpError(() =>
      muslimah.updatePeriod(userId, lama.data.id, { selesai: null }),
    );
    expect(err.status).toBe(409);
    expect(err.body.code).toBe('HAID_ACTIVE_EXISTS');
  });

  // ── BUG 1: race (double-tap) ─────────────────────────────────────────

  it('dua POST bersamaan hanya menghasilkan satu periode berlangsung', async () => {
    const hasil = await Promise.allSettled([
      muslimah.createPeriod(userId, { mulai: '2026-07-28' }),
      muslimah.createPeriod(userId, { mulai: '2026-07-28' }),
    ]);
    const sukses = hasil.filter((r) => r.status === 'fulfilled');
    expect(sukses.length).toBe(1);
    const rows = await prisma.haidPeriod.findMany({ where: { userId } });
    expect(rows.length).toBe(1);
  });

  // ── BUG 2: status konsisten dengan data periode ──────────────────────

  it('status di dalam periode aktif = jenis periode, bukan "suci"', async () => {
    await muslimah.createPeriod(userId, { mulai: '2026-07-28' });

    const res = (await muslimah.status(userId, '2026-07-28')) as StatusShape;
    expect(res.data.status).toBe('haid');
    expect(res.data.hariKe).toBe(1);
    expect(res.data.periode?.berlangsung).toBe(true);
    expect(res.data.ibadah.sholat.boleh).toBe(false);
  });

  it('periode aktif tetap berlaku untuk tanggal setelah mulai (terbuka sampai +∞)', async () => {
    await muslimah.createPeriod(userId, { mulai: '2026-07-28' });

    const res = (await muslimah.status(userId, '2026-08-02')) as StatusShape;
    expect(res.data.status).toBe('haid');
    expect(res.data.hariKe).toBe(6);
  });

  it('status "suci" untuk tanggal di luar semua periode', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    });

    const sebelum = (await muslimah.status(
      userId,
      '2026-05-31',
    )) as StatusShape;
    expect(sebelum.data.status).toBe('suci');
    expect(sebelum.data.periode).toBeNull();
    expect(sebelum.data.hariKe).toBeNull();
    expect(sebelum.data.ibadah.sholat.boleh).toBe(true);

    const sesudah = (await muslimah.status(
      userId,
      '2026-06-08',
    )) as StatusShape;
    expect(sesudah.data.status).toBe('suci');
  });

  it('status memakai batas inklusif di hari mulai & hari selesai', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    });
    const awal = (await muslimah.status(userId, '2026-06-01')) as StatusShape;
    const akhir = (await muslimah.status(userId, '2026-06-07')) as StatusShape;
    expect(awal.data.status).toBe('haid');
    expect(awal.data.hariKe).toBe(1);
    expect(akhir.data.status).toBe('haid');
    expect(akhir.data.hariKe).toBe(7);
  });

  it('jenis nifas/istihadhah dipantulkan apa adanya oleh status', async () => {
    await muslimah.createPeriod(userId, {
      jenis: 'istihadhah',
      mulai: '2026-06-01',
      selesai: '2026-06-05',
    });
    const res = (await muslimah.status(userId, '2026-06-03')) as StatusShape;
    expect(res.data.status).toBe('istihadhah');
    // Istihadhah dihukumi suci → tetap wajib sholat.
    expect(res.data.ibadah.sholat.boleh).toBe(true);
  });

  it('dashboard memakai sumber & aturan yang sama dengan status hari ini', async () => {
    // Periode aktif yang mulai kemarin → hari ini pasti tercakup.
    const kemarin = new Date(Date.now() + 7 * 60 * 60 * 1000 - 86400000)
      .toISOString()
      .slice(0, 10);
    await muslimah.createPeriod(userId, { mulai: kemarin });

    const dash = (await muslimah.dashboard(userId)) as {
      data: {
        tanggal: string;
        statusHaid: { status: string; hariKe: number | null };
        puasaSunnahBerikutnya: { tanggal: string } | null;
      };
    };
    const st = (await muslimah.status(userId, undefined)) as StatusShape;

    expect(dash.data.statusHaid.status).toBe(st.data.status);
    expect(dash.data.statusHaid.status).toBe('haid');
    expect(dash.data.statusHaid.hariKe).toBe(st.data.hariKe);
    // Saran puasa sunnah tidak boleh jatuh di hari yang statusnya haid.
    if (dash.data.puasaSunnahBerikutnya) {
      const cek = (await muslimah.status(
        userId,
        dash.data.puasaSunnahBerikutnya.tanggal,
      )) as StatusShape;
      expect(cek.data.status).not.toBe('haid');
    }
  });

  it('data korup lama (banyak periode aktif) tetap dibaca konsisten, bukan "suci"', async () => {
    // Tiru data yang sudah terlanjur tersimpan sebelum validasi ada.
    await prisma.haidPeriod.createMany({
      data: ['2026-07-28', '2026-07-28', '2026-07-28'].map((d) => ({
        userId,
        jenis: 'haid',
        mulai: new Date(`${d}T00:00:00.000Z`),
        selesai: null,
      })),
    });

    const res = (await muslimah.status(userId, '2026-07-29')) as StatusShape;
    expect(res.data.status).toBe('haid');
    expect(res.data.periode?.berlangsung).toBe(true);

    // Deterministik: dipanggil dua kali → periode yang sama.
    const lagi = (await muslimah.status(userId, '2026-07-29')) as StatusShape;
    expect(lagi.data.periode?.id).toBe(res.data.periode?.id);
  });

  // ── Envelope error yang sampai ke client ─────────────────────────────

  it('exception filter mengirim {success:false, message, code} apa adanya', async () => {
    await muslimah.createPeriod(userId, { mulai: '2026-07-28' });
    const thrown = await expectHttpError(() =>
      muslimah.createPeriod(userId, { mulai: '2026-07-28' }),
    );

    // Jalankan exception itu melalui filter global seperti saat request HTTP.
    const filter = new AllExceptionsFilter();
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) };
    const host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ method: 'POST', url: '/api/v1/muslimah/haid' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(
      new ConflictException({
        message: String(thrown.body.message),
        error: 'HAID_ACTIVE_EXISTS',
        code: 'HAID_ACTIVE_EXISTS',
      }),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/berlangsung/i),
        code: 'HAID_ACTIVE_EXISTS',
        statusCode: 409,
      }),
    );
  });

  it('response error biasa tetap tanpa field code (tidak ada perubahan kontrak)', () => {
    const filter = new AllExceptionsFilter();
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) };
    const host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ method: 'GET', url: '/api/v1/muslimah/haid/x' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(
      new NotFoundException({
        message: 'Periode tidak ditemukan',
        error: 'NOT_FOUND',
      }),
      host,
    );
    const payload = json.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('NOT_FOUND');
    expect('code' in payload).toBe(false);
  });

  // ── DTO: "" / null pada `selesai` ────────────────────────────────────

  it('DTO update menerima selesai "" dan null (tandai masih berlangsung)', async () => {
    for (const nilai of ['', null] as const) {
      const dto = plainToInstance(UpdateHaidPeriodDto, { selesai: nilai });
      expect(await validate(dto)).toHaveLength(0);
    }
    const salah = plainToInstance(UpdateHaidPeriodDto, {
      selesai: '28-07-2026',
    });
    expect((await validate(salah)).length).toBeGreaterThan(0);
  });
});
