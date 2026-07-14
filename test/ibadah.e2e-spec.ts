import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { IbadahService } from '../src/modules/ibadah/ibadah.service';

/**
 * Verifies the Daily Ibadah checklist logic at the service layer (no
 * HTTP/auth), matching the style of api-usage.e2e-spec.ts. We create a throw
 * away user, then assert getToday()/setSholat()/getSummary() compute the right
 * shape, counts, idempotency, and streak.
 */
describe('Daily Ibadah (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ibadah: IbadahService;
  let userId: string;

  type TodayShape = {
    data: {
      date: string;
      sholat: {
        subuh: boolean;
        dzuhur: boolean;
        ashar: boolean;
        maghrib: boolean;
        isya: boolean;
      };
      sholatCount: number;
    };
  };

  /** ISO YYYY-MM-DD hari ini di WIB — harus sama dengan yang dipakai service. */
  const todayWIB = () =>
    new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    ibadah = app.get(IbadahService);

    const user = await prisma.user.create({
      data: {
        email: `e2e-ibadah-${Date.now()}@example.test`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.userIbadahDaily.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('getToday returns all-false with count 0 before anything is marked', async () => {
    const res = (await ibadah.getToday(userId)) as TodayShape;
    expect(res.data.date).toBe(todayWIB());
    expect(res.data.sholatCount).toBe(0);
    expect(res.data.sholat).toEqual({
      subuh: false,
      dzuhur: false,
      ashar: false,
      maghrib: false,
      isya: false,
    });
  });

  it('setSholat marks a prayer and reflects it in the count', async () => {
    const res = (await ibadah.setSholat(userId, {
      prayer: 'subuh',
      done: true,
    })) as TodayShape;
    expect(res.data.sholat.subuh).toBe(true);
    expect(res.data.sholatCount).toBe(1);

    // A second prayer accumulates.
    const res2 = (await ibadah.setSholat(userId, {
      prayer: 'maghrib',
      done: true,
    })) as TodayShape;
    expect(res2.data.sholat.maghrib).toBe(true);
    expect(res2.data.sholatCount).toBe(2);
  });

  it('is idempotent — re-marking the same prayer keeps count stable', async () => {
    const res = (await ibadah.setSholat(userId, {
      prayer: 'subuh',
      done: true,
    })) as TodayShape;
    expect(res.data.sholatCount).toBe(2); // still subuh + maghrib
  });

  it('unsetting a prayer removes it from the count', async () => {
    const res = (await ibadah.setSholat(userId, {
      prayer: 'subuh',
      done: false,
    })) as TodayShape;
    expect(res.data.sholat.subuh).toBe(false);
    expect(res.data.sholatCount).toBe(1); // only maghrib left
  });

  it('getToday reflects persisted state and uses a single row per day', async () => {
    const res = (await ibadah.getToday(userId)) as TodayShape;
    expect(res.data.sholatCount).toBe(1);
    const rows = await prisma.userIbadahDaily.findMany({ where: { userId } });
    expect(rows.length).toBe(1); // upsert never duplicates the day
  });

  it('summary aggregates the window and counts today in the streak', async () => {
    const res = (await ibadah.getSummary(userId, 7)) as {
      data: {
        days: number;
        from: string;
        to: string;
        totalSholat: number;
        perfectDays: number;
        currentStreak: number;
        history: { date: string; sholatCount: number }[];
      };
    };
    expect(res.data.days).toBe(7);
    expect(res.data.to).toBe(todayWIB());
    expect(res.data.history.length).toBe(7);
    // Only today has data: 1 prayer (maghrib) marked.
    expect(res.data.totalSholat).toBe(1);
    expect(res.data.perfectDays).toBe(0);
    expect(res.data.currentStreak).toBe(1);
  });

  type DayShape = {
    data: {
      date: string;
      sholat: { subuh: boolean; maghrib: boolean };
      sholatCount: number;
      dzikir: boolean;
      tilawah: boolean;
      hafalan: boolean;
      completedCount: number;
    };
  };

  it('getToday now includes the 3 extra items (dzikir/tilawah/hafalan)', async () => {
    const res = (await ibadah.getToday(userId)) as DayShape;
    expect(res.data.dzikir).toBe(false);
    expect(res.data.tilawah).toBe(false);
    expect(res.data.hafalan).toBe(false);
    // Only maghrib marked so far → sholat not full, no extras → completedCount 0.
    expect(res.data.completedCount).toBe(0);
  });

  it('setItem marks a non-sholat item and bumps completedCount', async () => {
    const res = (await ibadah.setItem(userId, {
      item: 'dzikir',
      done: true,
    })) as DayShape;
    expect(res.data.dzikir).toBe(true);
    expect(res.data.completedCount).toBe(1); // dzikir only
    // Sholat count untouched by the dzikir toggle.
    expect(res.data.sholatCount).toBe(1);
  });

  it('setItem is idempotent and can unset', async () => {
    const same = (await ibadah.setItem(userId, {
      item: 'dzikir',
      done: true,
    })) as DayShape;
    expect(same.data.dzikir).toBe(true);
    const off = (await ibadah.setItem(userId, {
      item: 'dzikir',
      done: false,
    })) as DayShape;
    expect(off.data.dzikir).toBe(false);
    expect(off.data.completedCount).toBe(0);
  });

  it('setSholat still works and shares the same row as setItem', async () => {
    const res = (await ibadah.setSholat(userId, {
      prayer: 'subuh',
      done: true,
    })) as DayShape;
    expect(res.data.sholat.subuh).toBe(true);
    expect(res.data.sholatCount).toBe(2); // subuh + maghrib
    const rows = await prisma.userIbadahDaily.findMany({ where: { userId } });
    expect(rows.length).toBe(1); // legacy alias reuses the one daily row
  });

  it('setItem accepts an explicit past date without touching today', async () => {
    const past = new Date(Date.now() + 7 * 60 * 60 * 1000 - 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    const res = (await ibadah.setItem(userId, {
      item: 'tilawah',
      done: true,
      date: past,
    })) as DayShape;
    expect(res.data.date).toBe(past);
    expect(res.data.tilawah).toBe(true);
    // Today's row is unaffected.
    const today = (await ibadah.getToday(userId)) as DayShape;
    expect(today.data.tilawah).toBe(false);
  });

  it('getHistory returns only days with data, each with completedCount', async () => {
    const res = (await ibadah.getHistory(userId)) as {
      data: {
        date: string;
        sholatCount: number;
        dzikir: boolean;
        tilawah: boolean;
        completedCount: number;
      }[];
    };
    // Two days have data: today (2 sholat) and the past tilawah day.
    expect(res.data.length).toBe(2);
    expect(res.data.map((d) => d.date)).toEqual(
      [...res.data.map((d) => d.date)].sort(),
    ); // ascending
    const pastDay = res.data.find((d) => d.tilawah);
    expect(pastDay?.completedCount).toBe(1);
  });
});
