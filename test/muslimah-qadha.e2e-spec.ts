import { HttpException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MuslimahService } from '../src/modules/muslimah/muslimah.service';
import {
  jakartaTodayIso,
  ramadanBerikutnya,
} from '../src/modules/muslimah/muslimah.fiqh';

/**
 * Qadha puasa otomatis dari haid ∩ Ramadhan.
 *
 * Dipanggil di layer service (tanpa HTTP/auth) supaya ringan di VPS, tapi
 * tetap menembus Prisma + DB sungguhan sehingga transaksi, unique index
 * idempotensi, dan FK SET NULL ikut teruji.
 *
 * Tanggal acuan (kalender tabular Islam yang dipakai app):
 *   Ramadhan 1446 = 2025-02-27 .. 2025-03-28  (sudah lewat deadline-nya)
 *   Ramadhan 1447 = 2026-02-17 .. 2026-03-18  (deadline = 1 Ramadhan 1448)
 *   Ramadhan 1448 = 2027-02-06 .. 2027-03-07
 */
describe('Muslimah — qadha otomatis dari haid ∩ Ramadhan (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let muslimah: MuslimahService;
  let userId: string;

  type QadhaItem = {
    id: string;
    sumber: string;
    tahun: number | null;
    jumlah: number;
    lunas: number;
    catatan: string | null;
    sisa: number;
    selesai: boolean;
    otomatis: boolean;
    ramadanTahun: number | null;
    haidPeriodeId: string | null;
    deadline: string | null;
    terlambat: boolean;
    fidyahHari: number;
  };

  type QadhaList = {
    data: QadhaItem[];
    meta: {
      totalHutang: number;
      totalLunas: number;
      sisa: number;
      ramadanBerikutnya: {
        tanggal: string;
        hariLagi: number;
        tahunHijriah: number;
      };
      totalFidyahHari: number;
      entriTerlambat: number;
      disclaimer: string;
    };
  };

  type PeriodShape = { data: { id: string } };

  const listQadha = () =>
    muslimah.listQadha(userId) as unknown as Promise<QadhaList>;

  const otomatisSaja = async () =>
    (await listQadha()).data.filter((r) => r.otomatis);

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

  const reset = async () => {
    await prisma.qadhaPuasa.deleteMany({ where: { userId } });
    await prisma.haidPeriod.deleteMany({ where: { userId } });
  };

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
        email: `e2e-qadha-${Date.now()}@example.test`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await reset();
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  beforeEach(reset);

  // ── Auto-generate ────────────────────────────────────────────────────

  it('periode haid di Ramadhan menghasilkan 1 entri qadha otomatis sejumlah harinya', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24', // 5 hari, semuanya di Ramadhan 1447
    });

    const auto = await otomatisSaja();
    expect(auto).toHaveLength(1);
    expect(auto[0].jumlah).toBe(5);
    expect(auto[0].otomatis).toBe(true);
    expect(auto[0].ramadanTahun).toBe(1447);
    expect(auto[0].tahun).toBe(1447); // field lama ikut terisi
    expect(auto[0].haidPeriodeId).toBeTruthy();
    expect(auto[0].sumber).toBe('haid');
    expect(auto[0].lunas).toBe(0);
    expect(auto[0].sisa).toBe(5);
  });

  it('hanya hari yang benar-benar jatuh di Ramadhan yang dihitung', async () => {
    // 2026-02-15..2026-02-20: Ramadhan 1447 baru mulai 2026-02-17, jadi hanya
    // 4 dari 6 hari periode ini yang berhutang qadha.
    await muslimah.createPeriod(userId, {
      mulai: '2026-02-15',
      selesai: '2026-02-20',
    });
    const auto = await otomatisSaja();
    expect(auto).toHaveLength(1);
    expect(auto[0].jumlah).toBe(4);
  });

  it('periode di luar Ramadhan tidak menghasilkan entri qadha', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-07',
    });
    expect(await otomatisSaja()).toHaveLength(0);
  });

  it('istihadhah tidak menghasilkan qadha walau jatuh di Ramadhan', async () => {
    await muslimah.createPeriod(userId, {
      jenis: 'istihadhah',
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    });
    expect(await otomatisSaja()).toHaveLength(0);
  });

  it('periode yang masih berlangsung belum menghasilkan qadha (hutang belum pasti)', async () => {
    await muslimah.createPeriod(userId, { mulai: '2026-02-20' });
    expect(await otomatisSaja()).toHaveLength(0);
  });

  it('nifas di Ramadhan menghasilkan qadha dengan sumber "nifas"', async () => {
    await muslimah.createPeriod(userId, {
      jenis: 'nifas',
      mulai: '2026-02-20',
      selesai: '2026-02-23',
    });
    const auto = await otomatisSaja();
    expect(auto).toHaveLength(1);
    expect(auto[0].sumber).toBe('nifas');
    expect(auto[0].jumlah).toBe(4);
  });

  // ── Idempotensi ──────────────────────────────────────────────────────

  it('recompute berulang tidak pernah menghasilkan duplikat', async () => {
    const p = (await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    })) as PeriodShape;

    // Tiga kali update yang memicu recompute (catatan saja, tanggal tetap).
    for (const catatan of ['a', 'b', 'c']) {
      await muslimah.updatePeriod(userId, p.data.id, { catatan });
    }
    // Plus beberapa kali baca.
    await listQadha();
    await listQadha();

    const auto = await otomatisSaja();
    expect(auto).toHaveLength(1);
    expect(auto[0].jumlah).toBe(5);
  });

  it('memperpanjang periode menambah jumlah qadha, pembayaran tetap utuh', async () => {
    const p = (await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24', // 5 hari
    })) as PeriodShape;
    const auto1 = await otomatisSaja();
    await muslimah.bayarQadha(userId, auto1[0].id, { jumlah: 3 });

    await muslimah.updatePeriod(userId, p.data.id, { selesai: '2026-02-28' }); // 9 hari

    const auto2 = await otomatisSaja();
    expect(auto2).toHaveLength(1);
    expect(auto2[0].id).toBe(auto1[0].id); // baris yang sama, bukan baru
    expect(auto2[0].jumlah).toBe(9);
    expect(auto2[0].lunas).toBe(3); // pembayaran tidak hilang
    expect(auto2[0].sisa).toBe(6);
  });

  it('memperpendek periode mengurangi jumlah; lunas berlebih di-clamp & dijelaskan', async () => {
    const p = (await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-28', // 9 hari
    })) as PeriodShape;
    const auto1 = await otomatisSaja();
    await muslimah.bayarQadha(userId, auto1[0].id, { jumlah: 5 });

    await muslimah.updatePeriod(userId, p.data.id, { selesai: '2026-02-21' }); // 2 hari

    const auto2 = await otomatisSaja();
    expect(auto2).toHaveLength(1);
    expect(auto2[0].jumlah).toBe(2);
    expect(auto2[0].lunas).toBe(2); // di-clamp dari 5
    expect(auto2[0].sisa).toBe(0);
    expect(auto2[0].catatan).toMatch(/disesuaikan/i);
    expect(auto2[0].catatan).toMatch(/5/); // menjelaskan nilai lamanya
  });

  it('menggeser periode keluar Ramadhan menghapus qadha yang belum dibayar', async () => {
    const p = (await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    })) as PeriodShape;
    expect(await otomatisSaja()).toHaveLength(1);

    await muslimah.updatePeriod(userId, p.data.id, {
      mulai: '2026-06-01',
      selesai: '2026-06-05',
    });
    expect(await otomatisSaja()).toHaveLength(0);
  });

  // ── Hapus periode haid ───────────────────────────────────────────────

  it('menghapus periode haid menghapus qadha otomatis yang belum dibayar', async () => {
    const p = (await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    })) as PeriodShape;
    expect(await otomatisSaja()).toHaveLength(1);

    await muslimah.deletePeriod(userId, p.data.id);
    expect(await otomatisSaja()).toHaveLength(0);
  });

  it('menghapus periode haid TIDAK menghilangkan pembayaran yang sudah tercatat', async () => {
    const p = (await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24', // 5 hari
    })) as PeriodShape;
    const auto1 = await otomatisSaja();
    await muslimah.bayarQadha(userId, auto1[0].id, { jumlah: 3 });

    await muslimah.deletePeriod(userId, p.data.id);

    const auto2 = await otomatisSaja();
    expect(auto2).toHaveLength(1);
    expect(auto2[0].lunas).toBe(3); // riwayat pembayaran selamat
    expect(auto2[0].jumlah).toBe(3); // hutang gugur → tersisa catatan lunas
    expect(auto2[0].sisa).toBe(0);
    expect(auto2[0].selesai).toBe(true);
    expect(auto2[0].catatan).toMatch(/pembayaran/i);
    // FK SET NULL: barisnya bertahan walau periode sumbernya sudah hilang.
    expect(auto2[0].haidPeriodeId).toBeNull();
  });

  // ── Proteksi entri otomatis ──────────────────────────────────────────

  it('DELETE entri otomatis ditolak 409 QADHA_AUTO_PROTECTED', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    });
    const auto = await otomatisSaja();

    const err = await expectHttpError(() =>
      muslimah.deleteQadha(userId, auto[0].id),
    );
    expect(err.status).toBe(409);
    expect(err.body.code).toBe('QADHA_AUTO_PROTECTED');
    expect(String(err.body.message)).toMatch(/tidak bisa dihapus/i);

    // Entri tetap ada.
    expect(await otomatisSaja()).toHaveLength(1);
  });

  it('mengubah jumlah entri otomatis ditolak, tapi catatan & pembayaran boleh', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    });
    const auto = await otomatisSaja();

    const err = await expectHttpError(() =>
      muslimah.updateQadha(userId, auto[0].id, { jumlah: 99 }),
    );
    expect(err.status).toBe(409);
    expect(err.body.code).toBe('QADHA_AUTO_PROTECTED');

    // Catatan tetap boleh diubah.
    await muslimah.updateQadha(userId, auto[0].id, { catatan: 'niat besok' });
    // Pembayaran tetap boleh dicatat.
    await muslimah.bayarQadha(userId, auto[0].id, { jumlah: 1 });
    const after = await otomatisSaja();
    expect(after[0].catatan).toBe('niat besok');
    expect(after[0].lunas).toBe(1);
    expect(after[0].jumlah).toBe(5); // tidak berubah
  });

  it('entri manual tetap bisa dihapus & ditandai otomatis=false', async () => {
    const created = (await muslimah.createQadha(userId, {
      jumlah: 4,
      sumber: 'sakit',
    })) as { data: QadhaItem };
    expect(created.data.otomatis).toBe(false);
    expect(created.data.ramadanTahun).toBeNull();

    await muslimah.deleteQadha(userId, created.data.id);
    expect((await listQadha()).data).toHaveLength(0);
  });

  it('entri manual berdampingan dengan entri otomatis tanpa saling bentrok', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    });
    await muslimah.createQadha(userId, { jumlah: 2, sumber: 'safar' });
    await muslimah.createQadha(userId, { jumlah: 3, sumber: 'sakit' });

    const all = (await listQadha()).data;
    expect(all).toHaveLength(3);
    expect(all.filter((r) => r.otomatis)).toHaveLength(1);
    expect((await listQadha()).meta.totalHutang).toBe(10); // 5 + 2 + 3
  });

  // ── Deadline, keterlambatan, fidyah ──────────────────────────────────

  it('meta memuat hitung mundur Ramadhan berikutnya', async () => {
    const meta = (await listQadha()).meta;
    const harapan = ramadanBerikutnya(jakartaTodayIso());
    expect(meta.ramadanBerikutnya.tanggal).toBe(harapan.tanggal);
    expect(meta.ramadanBerikutnya.tahunHijriah).toBe(harapan.tahunHijriah);
    expect(meta.ramadanBerikutnya.hariLagi).toBe(harapan.hariLagi);
    expect(meta.ramadanBerikutnya.hariLagi).toBeGreaterThanOrEqual(0);
    expect(meta.ramadanBerikutnya.tanggal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('hutang Ramadhan 1447 belum terlambat; deadline = 1 Ramadhan 1448', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    });
    const auto = await otomatisSaja();
    expect(auto[0].deadline).toBe('2027-02-06');
    expect(auto[0].terlambat).toBe(false);
    expect(auto[0].fidyahHari).toBe(0);
  });

  it('hutang Ramadhan 1446 sudah lewat deadline → terlambat & kena fidyah', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2025-03-01',
      selesai: '2025-03-06', // 6 hari di Ramadhan 1446
    });
    const auto = await otomatisSaja();
    expect(auto[0].ramadanTahun).toBe(1446);
    expect(auto[0].deadline).toBe('2026-02-17'); // 1 Ramadhan 1447, sudah lewat
    expect(auto[0].terlambat).toBe(true);
    expect(auto[0].fidyahHari).toBe(6);

    const meta = (await listQadha()).meta;
    expect(meta.entriTerlambat).toBe(1);
    expect(meta.totalFidyahHari).toBe(6);
    expect(meta.disclaimer).toMatch(/ustadz/i);
  });

  it('fidyah menyusut mengikuti pembayaran dan hilang saat lunas', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2025-03-01',
      selesai: '2025-03-06', // 6 hari, Ramadhan 1446 (terlambat)
    });
    const auto = await otomatisSaja();

    await muslimah.bayarQadha(userId, auto[0].id, { jumlah: 4 });
    const sebagian = await otomatisSaja();
    expect(sebagian[0].fidyahHari).toBe(2); // sisa 2 hari
    expect(sebagian[0].terlambat).toBe(true);

    await muslimah.bayarQadha(userId, auto[0].id, { jumlah: 2 });
    const lunas = await otomatisSaja();
    expect(lunas[0].sisa).toBe(0);
    expect(lunas[0].terlambat).toBe(false);
    expect(lunas[0].fidyahHari).toBe(0);
    expect((await listQadha()).meta.totalFidyahHari).toBe(0);
  });

  it('entri manual lama (hanya punya `tahun`) tetap dapat deadline & fidyah', async () => {
    // Meniru baris manual yang dibuat app sebelum fitur ini ada.
    await muslimah.createQadha(userId, { jumlah: 3, tahun: 1446 });
    const items = (await listQadha()).data;
    expect(items[0].otomatis).toBe(false);
    expect(items[0].ramadanTahun).toBeNull();
    expect(items[0].deadline).toBe('2026-02-17'); // fallback ke `tahun`
    expect(items[0].terlambat).toBe(true);
    expect(items[0].fidyahHari).toBe(3);
  });

  // ── Kontrak lama ─────────────────────────────────────────────────────

  it('field lama & envelope tidak berubah (kontrak yang dipakai app)', async () => {
    await muslimah.createPeriod(userId, {
      mulai: '2026-02-20',
      selesai: '2026-02-24',
    });
    const res = (await listQadha()) as unknown as {
      success?: boolean;
      message: string;
      data: QadhaItem[];
      meta: Record<string, unknown>;
    };
    const item = res.data[0];

    // Field lama wajib tetap ada dengan tipe yang sama.
    for (const k of [
      'id',
      'sumber',
      'jumlah',
      'lunas',
      'tahun',
      'catatan',
      'sisa',
      'selesai',
      'createdAt',
      'updatedAt',
    ]) {
      expect(item).toHaveProperty(k);
    }
    // Field baru bersifat tambahan.
    for (const k of [
      'otomatis',
      'ramadanTahun',
      'haidPeriodeId',
      'deadline',
      'terlambat',
      'fidyahHari',
    ]) {
      expect(item).toHaveProperty(k);
    }
    // meta lama tetap.
    for (const k of ['totalHutang', 'totalLunas', 'sisa']) {
      expect(res.meta).toHaveProperty(k);
    }
    expect(typeof res.message).toBe('string');
  });
});
