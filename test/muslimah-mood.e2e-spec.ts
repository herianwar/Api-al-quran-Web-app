import { HttpException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MoodService } from '../src/modules/muslimah/muslimah.mood.service';
import { MuslimahService } from '../src/modules/muslimah/muslimah.service';
import {
  faseTanggal,
  hitungInsight,
} from '../src/modules/muslimah/muslimah.mood';
import {
  addDaysIso,
  jakartaTodayIso,
} from '../src/modules/muslimah/muslimah.fiqh';

/**
 * Catatan mood & gejala harian Muslimah.
 *
 * Dipanggil di layer service (tanpa HTTP/auth) supaya ringan di VPS — satu kali
 * boot Nest untuk seluruh file — tapi tetap menembus Prisma + DB sungguhan
 * sehingga unique (userId, tanggal), upsert, dan kolom jsonb ikut teruji.
 * Bagian insight yang murni diuji langsung tanpa DB.
 */
describe('Muslimah — catatan mood & gejala (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mood: MoodService;
  let muslimah: MuslimahService;
  let userId: string;
  let userLain: string;

  type Entry = {
    id: string;
    tanggal: string;
    mood: string | null;
    flow: string | null;
    symptoms: { key: string; intensitas: string | null }[];
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  type One = { data: Entry | null; message: string };
  type Many = {
    data: Entry[];
    meta: { from: string; to: string; total: number };
  };

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
    await prisma.moodEntry.deleteMany({ where: { userId } });
    await prisma.haidPeriod.deleteMany({ where: { userId } });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    mood = app.get(MoodService);
    muslimah = app.get(MuslimahService);

    const stamp = Date.now();
    const u = await prisma.user.create({
      data: { email: `e2e-mood-${stamp}@example.test`, passwordHash: 'x' },
    });
    userId = u.id;
    const other = await prisma.user.create({
      data: { email: `e2e-mood-lain-${stamp}@example.test`, passwordHash: 'x' },
    });
    userLain = other.id;
  });

  afterAll(async () => {
    await reset();
    await prisma.moodEntry.deleteMany({ where: { userId: userLain } });
    await prisma.qadhaPuasa.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, userLain] } } });
    await app.close();
  });

  beforeEach(reset);

  // ── Round-trip ───────────────────────────────────────────────────────

  it('PUT lalu GET tanggal yang sama mengembalikan data yang identik', async () => {
    await mood.upsert(userId, '2026-07-20', {
      mood: 'tired',
      flow: 'sedang',
      note: 'agak pusing sejak pagi',
      symptoms: [{ key: 'kram', intensitas: 'berat' }, { key: 'lelah' }],
    });

    const res = (await mood.get(userId, '2026-07-20')) as One;
    expect(res.data).not.toBeNull();
    expect(res.data?.tanggal).toBe('2026-07-20');
    expect(res.data?.mood).toBe('tired');
    expect(res.data?.flow).toBe('sedang');
    expect(res.data?.note).toBe('agak pusing sejak pagi');
    expect(res.data?.symptoms).toEqual([
      { key: 'kram', intensitas: 'berat' },
      { key: 'lelah', intensitas: null },
    ]);
  });

  it('PUT dua kali di tanggal sama meng-upsert, bukan menduplikasi', async () => {
    await mood.upsert(userId, '2026-07-20', { mood: 'sad' });
    const kedua = (await mood.upsert(userId, '2026-07-20', {
      mood: 'calm',
    })) as One;

    expect(kedua.data?.mood).toBe('calm');
    const rows = await prisma.moodEntry.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
  });

  it('PUT dengan field null mengosongkan field tersebut', async () => {
    await mood.upsert(userId, '2026-07-20', {
      mood: 'joyful',
      flow: 'deras',
      note: 'catatan lama',
      symptoms: [{ key: 'kram', intensitas: 'ringan' }],
    });

    const kosong = (await mood.upsert(userId, '2026-07-20', {
      mood: null,
      flow: null,
      note: null,
      symptoms: null,
    })) as One;

    expect(kosong.data?.mood).toBeNull();
    expect(kosong.data?.flow).toBeNull();
    expect(kosong.data?.note).toBeNull();
    expect(kosong.data?.symptoms).toEqual([]);

    // Dan benar-benar tersimpan kosong, bukan cuma di response.
    const dibaca = (await mood.get(userId, '2026-07-20')) as One;
    expect(dibaca.data?.mood).toBeNull();
    expect(dibaca.data?.symptoms).toEqual([]);
  });

  it('PUT bersifat replace: field yang tidak dikirim ikut dikosongkan', async () => {
    await mood.upsert(userId, '2026-07-20', {
      mood: 'joyful',
      note: 'ada catatan',
    });
    const hanyaMood = (await mood.upsert(userId, '2026-07-20', {
      mood: 'calm',
    })) as One;
    expect(hanyaMood.data?.mood).toBe('calm');
    expect(hanyaMood.data?.note).toBeNull();
  });

  it('GET tanggal tanpa catatan mengembalikan data null, bukan error', async () => {
    const res = (await mood.get(userId, '2026-01-01')) as One;
    expect(res.data).toBeNull();
    expect(res.message).toMatch(/belum ada/i);
  });

  it('DELETE menghapus entri; menghapus yang tidak ada → 404', async () => {
    await mood.upsert(userId, '2026-07-20', { mood: 'neutral' });
    await mood.remove(userId, '2026-07-20');
    expect(((await mood.get(userId, '2026-07-20')) as One).data).toBeNull();

    const err = await expectHttpError(() => mood.remove(userId, '2026-07-20'));
    expect(err.status).toBe(404);
  });

  // ── Rentang & isolasi antar user ─────────────────────────────────────

  it('GET range hanya mengembalikan entri di dalam rentang', async () => {
    for (const t of ['2026-07-01', '2026-07-10', '2026-07-20', '2026-07-25']) {
      await mood.upsert(userId, t, { mood: 'calm' });
    }
    const res = (await mood.list(userId, {
      from: '2026-07-05',
      to: '2026-07-21',
    })) as Many;

    expect(res.data.map((e) => e.tanggal)).toEqual([
      '2026-07-20',
      '2026-07-10',
    ]);
    expect(res.meta.total).toBe(2);
    expect(res.meta.from).toBe('2026-07-05');
    expect(res.meta.to).toBe('2026-07-21');
  });

  it('GET range default 60 hari terakhir bila from/to tidak dikirim', async () => {
    const hariIni = jakartaTodayIso();
    await mood.upsert(userId, hariIni, { mood: 'calm' });
    await mood.upsert(userId, addDaysIso(hariIni, -30), { mood: 'sad' });
    await mood.upsert(userId, addDaysIso(hariIni, -90), { mood: 'tired' });

    const res = (await mood.list(userId, {})) as Many;
    expect(res.meta.to).toBe(hariIni);
    expect(res.meta.from).toBe(addDaysIso(hariIni, -59));
    expect(res.data).toHaveLength(2); // yang -90 hari di luar rentang
  });

  it('data user lain tidak pernah ikut terbaca', async () => {
    await mood.upsert(userId, '2026-07-20', { mood: 'calm' });
    await mood.upsert(userLain, '2026-07-20', {
      mood: 'angry',
      note: 'rahasia',
    });

    const punyaku = (await mood.list(userId, {
      from: '2026-07-01',
      to: '2026-07-31',
    })) as Many;
    expect(punyaku.data).toHaveLength(1);
    expect(punyaku.data[0].mood).toBe('calm');

    const satu = (await mood.get(userId, '2026-07-20')) as One;
    expect(satu.data?.note).toBeNull();

    // Menghapus tanggal yang sama tidak menyentuh entri user lain.
    await mood.remove(userId, '2026-07-20');
    const lain = (await mood.get(userLain, '2026-07-20')) as One;
    expect(lain.data?.mood).toBe('angry');
    await prisma.moodEntry.deleteMany({ where: { userId: userLain } });
  });

  // ── Validasi ─────────────────────────────────────────────────────────

  it('mood di luar enum ditolak 422 MOOD_INVALID_VALUE', async () => {
    const err = await expectHttpError(() =>
      mood.upsert(userId, '2026-07-20', { mood: 'bahagia_sekali' }),
    );
    expect(err.status).toBe(422);
    expect(err.body.code).toBe('MOOD_INVALID_VALUE');
    expect(await prisma.moodEntry.count({ where: { userId } })).toBe(0);
  });

  it('flow di luar enum ditolak 422', async () => {
    const err = await expectHttpError(() =>
      mood.upsert(userId, '2026-07-20', { flow: 'banjir' }),
    );
    expect(err.status).toBe(422);
    expect(err.body.code).toBe('MOOD_INVALID_VALUE');
  });

  it('key gejala di luar katalog ditolak 422 (bukan diabaikan diam-diam)', async () => {
    const err = await expectHttpError(() =>
      mood.upsert(userId, '2026-07-20', {
        symptoms: [{ key: 'kram' }, { key: 'meriang' }],
      }),
    );
    expect(err.status).toBe(422);
    expect(err.body.code).toBe('MOOD_INVALID_VALUE');
    expect(String(err.body.message)).toMatch(/meriang/);
    // Tidak ada yang tersimpan sebagian.
    expect(await prisma.moodEntry.count({ where: { userId } })).toBe(0);
  });

  it('intensitas di luar enum ditolak 422', async () => {
    const err = await expectHttpError(() =>
      mood.upsert(userId, '2026-07-20', {
        symptoms: [{ key: 'kram', intensitas: 'parah_banget' }],
      }),
    );
    expect(err.status).toBe(422);
    expect(err.body.code).toBe('MOOD_INVALID_VALUE');
  });

  it('tanggal masa depan (> besok) ditolak 422 MOOD_FUTURE_DATE', async () => {
    const jauh = addDaysIso(jakartaTodayIso(), 3);
    const err = await expectHttpError(() =>
      mood.upsert(userId, jauh, { mood: 'calm' }),
    );
    expect(err.status).toBe(422);
    expect(err.body.code).toBe('MOOD_FUTURE_DATE');

    // Hari ini & besok tetap boleh (toleransi timezone perangkat).
    await mood.upsert(userId, jakartaTodayIso(), { mood: 'calm' });
    await mood.upsert(userId, addDaysIso(jakartaTodayIso(), 1), {
      mood: 'calm',
    });
    expect(await prisma.moodEntry.count({ where: { userId } })).toBe(2);
  });

  it('format tanggal salah ditolak 422', async () => {
    const err = await expectHttpError(() =>
      mood.upsert(userId, '20-07-2026', { mood: 'calm' }),
    );
    expect(err.status).toBe(422);
  });

  it('gejala yang sama dikirim dua kali disimpan sekali (yang terakhir menang)', async () => {
    const res = (await mood.upsert(userId, '2026-07-20', {
      symptoms: [
        { key: 'kram', intensitas: 'ringan' },
        { key: 'kram', intensitas: 'berat' },
      ],
    })) as One;
    expect(res.data?.symptoms).toEqual([{ key: 'kram', intensitas: 'berat' }]);
  });

  // ── Bulk import ──────────────────────────────────────────────────────

  it('bulk upsert menyimpan semua entri dan idempoten saat diulang', async () => {
    const payload = {
      entries: [
        { tanggal: '2026-07-01', mood: 'calm', symptoms: [{ key: 'lelah' }] },
        { tanggal: '2026-07-02', mood: 'sad' },
        { tanggal: '2026-07-03', flow: 'ringan' },
      ],
    };

    const pertama = (await mood.bulk(userId, payload)) as {
      data: { diterima: number; disimpan: number; totalTersimpan: number };
    };
    expect(pertama.data.disimpan).toBe(3);
    expect(pertama.data.totalTersimpan).toBe(3);

    // Diulang dengan payload yang sama → tetap 3 baris, tidak menduplikasi.
    const kedua = (await mood.bulk(userId, payload)) as {
      data: { totalTersimpan: number };
    };
    expect(kedua.data.totalTersimpan).toBe(3);
    expect(await prisma.moodEntry.count({ where: { userId } })).toBe(3);
  });

  it('bulk dengan tanggal duplikat di satu payload menyimpan satu baris', async () => {
    const res = (await mood.bulk(userId, {
      entries: [
        { tanggal: '2026-07-01', mood: 'calm' },
        { tanggal: '2026-07-01', mood: 'angry' },
      ],
    })) as { data: { disimpan: number; duplikatDalamPayload: number } };

    expect(res.data.disimpan).toBe(1);
    expect(res.data.duplikatDalamPayload).toBe(1);
    const satu = (await mood.get(userId, '2026-07-01')) as One;
    expect(satu.data?.mood).toBe('angry'); // yang terakhir menang
  });

  it('bulk menolak seluruh payload bila ada satu entri tidak valid', async () => {
    const err = await expectHttpError(() =>
      mood.bulk(userId, {
        entries: [
          { tanggal: '2026-07-01', mood: 'calm' },
          { tanggal: '2026-07-02', mood: 'ngambek' },
        ],
      }),
    );
    expect(err.status).toBe(422);
    // Tidak ada import setengah jadi.
    expect(await prisma.moodEntry.count({ where: { userId } })).toBe(0);
  });

  it('bulk memperbarui entri yang sudah ada, bukan menambah baris', async () => {
    await mood.upsert(userId, '2026-07-01', { mood: 'sad', note: 'lama' });
    await mood.bulk(userId, {
      entries: [{ tanggal: '2026-07-01', mood: 'joyful' }],
    });
    const satu = (await mood.get(userId, '2026-07-01')) as One;
    expect(satu.data?.mood).toBe('joyful');
    expect(satu.data?.note).toBeNull();
    expect(await prisma.moodEntry.count({ where: { userId } })).toBe(1);
  });

  // ── Insight ──────────────────────────────────────────────────────────

  it('insight mengembalikan cukupData:false saat siklus < 2', async () => {
    await mood.upsert(userId, '2026-07-20', { mood: 'sad' });
    const res = (await mood.insight(userId)) as {
      data: { cukupData: boolean; keterangan: string; disclaimer: string };
    };
    expect(res.data.cukupData).toBe(false);
    expect(res.data.keterangan).toMatch(/minimal 2 siklus/i);
    expect(res.data.disclaimer).toMatch(/bukan diagnosis/i);
  });

  it('insight menghitung pola gejala per fase setelah 2 siklus tercatat', async () => {
    // Dua siklus haid: 1–5 Mei dan 1–5 Juni 2026.
    await muslimah.createPeriod(userId, {
      mulai: '2026-05-01',
      selesai: '2026-05-05',
    });
    await muslimah.createPeriod(userId, {
      mulai: '2026-06-01',
      selesai: '2026-06-05',
    });

    // Kram dicatat menjelang & saat haid; jerawat jauh dari haid.
    await mood.bulk(userId, {
      entries: [
        { tanggal: '2026-04-29', mood: 'sad', symptoms: [{ key: 'kram' }] },
        { tanggal: '2026-05-02', mood: 'tired', symptoms: [{ key: 'kram' }] },
        { tanggal: '2026-05-30', mood: 'sad', symptoms: [{ key: 'kram' }] },
        { tanggal: '2026-06-02', mood: 'tired', symptoms: [{ key: 'kram' }] },
        {
          tanggal: '2026-05-15',
          mood: 'joyful',
          symptoms: [{ key: 'jerawat' }],
        },
      ],
    });

    const res = (await mood.insight(userId)) as {
      data: {
        cukupData: boolean;
        jumlahCatatan: number;
        jumlahSiklus: number;
        symptomByPhase: {
          key: string;
          total: number;
          fase: { praHaid: number; haid: number; suci: number };
          faseTersering: string | null;
          rentangOffset: { dari: number; sampai: number } | null;
        }[];
        moodTrend: Record<string, Record<string, number>>;
        moodDominan: Record<string, string | null>;
      };
    };

    expect(res.data.cukupData).toBe(true);
    expect(res.data.jumlahSiklus).toBe(2);
    expect(res.data.jumlahCatatan).toBe(5);

    const kram = res.data.symptomByPhase.find((s) => s.key === 'kram');
    expect(kram?.total).toBe(4);
    expect(kram?.fase.praHaid).toBe(2); // 29 Apr & 30 Mei
    expect(kram?.fase.haid).toBe(2); // 2 Mei & 2 Jun
    expect(kram?.fase.suci).toBe(0);
    expect(kram?.rentangOffset).toEqual({ dari: -2, sampai: 1 });

    const jerawat = res.data.symptomByPhase.find((s) => s.key === 'jerawat');
    expect(jerawat?.fase.suci).toBe(1);

    // Gejala terbanyak diurut lebih dulu.
    expect(res.data.symptomByPhase[0].key).toBe('kram');
    // Mood saat haid: tired 2x → dominan.
    expect(res.data.moodTrend.haid.tired).toBe(2);
    expect(res.data.moodDominan.haid).toBe('tired');
    expect(res.data.moodDominan.praHaid).toBe('sad');
  });

  // ── Fungsi murni (tanpa DB) ──────────────────────────────────────────

  it('faseTanggal memetakan pra-haid / haid / suci beserta offsetnya', () => {
    const periods = [
      { jenis: 'haid', mulai: '2026-05-01', selesai: '2026-05-05' },
    ];
    expect(faseTanggal('2026-05-01', periods)).toEqual({
      fase: 'haid',
      offset: 0,
    });
    expect(faseTanggal('2026-05-03', periods)).toEqual({
      fase: 'haid',
      offset: 2,
    });
    expect(faseTanggal('2026-04-29', periods)).toEqual({
      fase: 'praHaid',
      offset: -2,
    });
    // 6 hari sebelum mulai → di luar jendela pra-haid (5 hari).
    expect(faseTanggal('2026-04-25', periods).fase).toBe('suci');
    // Jauh dari siklus mana pun → offset null, tidak dipaksa dikaitkan.
    expect(faseTanggal('2026-09-01', periods)).toEqual({
      fase: 'suci',
      offset: null,
    });
  });

  it('hitungInsight tidak memaksakan pemenang saat frekuensinya seri', () => {
    const periods = [
      { jenis: 'haid', mulai: '2026-05-01', selesai: '2026-05-05' },
      { jenis: 'haid', mulai: '2026-06-01', selesai: '2026-06-05' },
    ];
    const res = hitungInsight(
      [
        { tanggal: '2026-05-02', mood: 'sad', flow: null, symptoms: [] },
        { tanggal: '2026-06-02', mood: 'calm', flow: null, symptoms: [] },
      ],
      periods,
    );
    expect(res.cukupData).toBe(true);
    expect(res.moodTrend.haid).toEqual({ sad: 1, calm: 1 });
    expect(res.moodDominan.haid).toBeNull(); // seri → tidak ada dominan
  });

  it('periode haid yang masih berlangsung tetap dihitung sebagai fase haid', () => {
    const periods = [{ jenis: 'haid', mulai: '2026-05-01', selesai: null }];
    expect(faseTanggal('2026-05-09', periods).fase).toBe('haid');
  });
});
