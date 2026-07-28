import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BulkMoodDto,
  MoodRangeQueryDto,
  SymptomDto,
  UpsertMoodDto,
} from './dto/muslimah.dto';
import { addDaysIso, jakartaTodayIso } from './muslimah.fiqh';
import {
  FLOW_SET,
  INTENSITAS_SET,
  MOOD_SET,
  MoodRecord,
  SYMPTOM_KEYS,
  Symptom,
  hitungInsight,
} from './muslimah.mood';

/** Kode error domain untuk catatan mood (client bercabang di `code`). */
export const MOOD_INVALID_VALUE = 'MOOD_INVALID_VALUE';
export const MOOD_FUTURE_DATE = 'MOOD_FUTURE_DATE';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Rentang default GET /muslimah/mood bila client tidak mengirim from/to. */
const DEFAULT_RANGE_DAYS = 60;

interface MoodRow {
  id: string;
  userId: string;
  tanggal: string;
  mood: string | null;
  flow: string | null;
  symptoms: Prisma.JsonValue;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Baca kolom jsonb `symptoms` dengan defensif: baris lama / data manual bisa
 * saja bukan array. Bentuk yang tidak dikenali dianggap kosong daripada
 * membuat response rusak.
 */
function parseSymptoms(value: Prisma.JsonValue): Symptom[] {
  if (!Array.isArray(value)) return [];
  const out: Symptom[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.key !== 'string') continue;
    const intensitas =
      typeof rec.intensitas === 'string' && INTENSITAS_SET.has(rec.intensitas)
        ? (rec.intensitas as Symptom['intensitas'])
        : null;
    out.push({ key: rec.key, intensitas });
  }
  return out;
}

/**
 * `Symptom[]` → nilai yang diterima kolom jsonb. Prisma menuntut tipe
 * InputJsonValue (index signature), sementara Symptom adalah interface —
 * konversinya aman karena isinya hanya string/null.
 */
function toJson(symptoms: Symptom[]): Prisma.InputJsonValue {
  return symptoms as unknown as Prisma.InputJsonValue;
}

/** Bentuk wire satu entri mood. */
function mapMood(r: MoodRow) {
  return {
    id: r.id,
    tanggal: r.tanggal,
    mood: r.mood,
    flow: r.flow,
    symptoms: parseSymptoms(r.symptoms),
    note: r.note,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MoodService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Validasi ────────────────────────────────────────────────────────

  private tolak(message: string, code = MOOD_INVALID_VALUE): never {
    throw new UnprocessableEntityException({ message, error: code, code });
  }

  /**
   * Tanggal harus `YYYY-MM-DD` dan tidak boleh lebih jauh dari BESOK (WIB).
   * Besok masih diizinkan supaya user di timezone yang lebih awal dari WIB
   * tidak ditolak saat mencatat "hari ini" versi perangkatnya.
   */
  private assertTanggal(tanggal: string): string {
    if (!ISO_DATE.test(tanggal)) {
      this.tolak('Tanggal harus format YYYY-MM-DD');
    }
    const batas = addDaysIso(jakartaTodayIso(), 1);
    if (tanggal > batas) {
      this.tolak(
        `Tidak bisa mencatat untuk tanggal di masa depan (maksimal ${batas}).`,
        MOOD_FUTURE_DATE,
      );
    }
    return tanggal;
  }

  /** Normalisasi + validasi payload upsert terhadap katalog. */
  private siapkanData(dto: UpsertMoodDto): {
    mood: string | null;
    flow: string | null;
    symptoms: Symptom[];
    note: string | null;
  } {
    if (dto.mood != null && !MOOD_SET.has(dto.mood)) {
      this.tolak(
        `Mood "${dto.mood}" tidak dikenal. Pilihan: ${[...MOOD_SET].join(', ')}.`,
      );
    }
    if (dto.flow != null && !FLOW_SET.has(dto.flow)) {
      this.tolak(
        `Flow "${dto.flow}" tidak dikenal. Pilihan: ${[...FLOW_SET].join(', ')}.`,
      );
    }

    const symptoms: Symptom[] = [];
    const sudahAda = new Set<string>();
    for (const s of (dto.symptoms ?? []) as SymptomDto[]) {
      if (!SYMPTOM_KEYS.has(s.key)) {
        this.tolak(
          `Gejala "${s.key}" tidak dikenal. Pilihan: ${[...SYMPTOM_KEYS].join(', ')}.`,
        );
      }
      if (s.intensitas != null && !INTENSITAS_SET.has(s.intensitas)) {
        this.tolak(
          `Intensitas "${s.intensitas}" tidak dikenal. Pilihan: ${[...INTENSITAS_SET].join(', ')}.`,
        );
      }
      // Gejala yang sama dikirim dua kali → simpan sekali (yang terakhir menang).
      if (sudahAda.has(s.key)) {
        const idx = symptoms.findIndex((x) => x.key === s.key);
        symptoms[idx] = {
          key: s.key,
          intensitas: (s.intensitas ?? null) as Symptom['intensitas'],
        };
        continue;
      }
      sudahAda.add(s.key);
      symptoms.push({
        key: s.key,
        intensitas: (s.intensitas ?? null) as Symptom['intensitas'],
      });
    }

    // PUT bersifat replace: field yang tidak dikirim ikut dikosongkan, sesuai
    // kontrak "kirim field yang null untuk mengosongkan".
    return {
      mood: dto.mood ?? null,
      flow: dto.flow ?? null,
      symptoms,
      note: dto.note ?? null,
    };
  }

  // ─── CRUD ────────────────────────────────────────────────────────────

  async list(
    userId: string,
    q: MoodRangeQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const to = q.to ?? jakartaTodayIso();
    const from = q.from ?? addDaysIso(to, -(DEFAULT_RANGE_DAYS - 1));
    if (from > to) {
      this.tolak('Rentang tidak valid: `from` tidak boleh setelah `to`.');
    }

    const rows = await this.prisma.moodEntry.findMany({
      where: { userId, tanggal: { gte: from, lte: to } },
      orderBy: { tanggal: 'desc' },
    });
    return ok(rows.map(mapMood), `Catatan mood ${from} s/d ${to}`, {
      from,
      to,
      total: rows.length,
    });
  }

  async get(
    userId: string,
    tanggal: string,
  ): Promise<ResponsePayload<unknown>> {
    if (!ISO_DATE.test(tanggal)) {
      this.tolak('Tanggal harus format YYYY-MM-DD');
    }
    const row = await this.prisma.moodEntry.findUnique({
      where: { userId_tanggal: { userId, tanggal } },
    });
    // Hari tanpa catatan bukan error — app menampilkan form kosong.
    return row
      ? ok(mapMood(row), `Catatan mood ${tanggal}`)
      : ok(null, `Belum ada catatan mood untuk ${tanggal}`);
  }

  async upsert(
    userId: string,
    tanggal: string,
    dto: UpsertMoodDto,
  ): Promise<ResponsePayload<unknown>> {
    this.assertTanggal(tanggal);
    const data = this.siapkanData(dto);
    const row = await this.prisma.moodEntry.upsert({
      where: { userId_tanggal: { userId, tanggal } },
      create: { userId, tanggal, ...data, symptoms: toJson(data.symptoms) },
      update: { ...data, symptoms: toJson(data.symptoms) },
    });
    return ok(mapMood(row), `Catatan mood ${tanggal} disimpan`);
  }

  async remove(
    userId: string,
    tanggal: string,
  ): Promise<ResponsePayload<unknown>> {
    if (!ISO_DATE.test(tanggal)) {
      this.tolak('Tanggal harus format YYYY-MM-DD');
    }
    const result = await this.prisma.moodEntry.deleteMany({
      where: { userId, tanggal },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        message: `Tidak ada catatan mood pada ${tanggal}`,
        error: 'NOT_FOUND',
      });
    }
    return ok({ deleted: true }, `Catatan mood ${tanggal} dihapus`);
  }

  /**
   * Import massal catatan lokal saat sync pertama. Idempoten: upsert per
   * tanggal, jadi mengirim ulang payload yang sama tidak menduplikasi apa pun
   * (unique (userId, tanggal) yang menjaminnya).
   */
  async bulk(
    userId: string,
    dto: BulkMoodDto,
  ): Promise<ResponsePayload<unknown>> {
    // Validasi SEMUA dulu sebelum menulis apa pun, supaya satu entri rusak
    // tidak meninggalkan import setengah jadi.
    const siap = dto.entries.map((e) => ({
      tanggal: this.assertTanggal(e.tanggal),
      data: this.siapkanData(e),
    }));

    // Tanggal duplikat di dalam satu payload: yang terakhir menang.
    const perTanggal = new Map<string, (typeof siap)[number]>();
    for (const item of siap) perTanggal.set(item.tanggal, item);

    await this.prisma.$transaction(
      [...perTanggal.values()].map((item) =>
        this.prisma.moodEntry.upsert({
          where: { userId_tanggal: { userId, tanggal: item.tanggal } },
          create: {
            userId,
            tanggal: item.tanggal,
            ...item.data,
            symptoms: toJson(item.data.symptoms),
          },
          update: { ...item.data, symptoms: toJson(item.data.symptoms) },
        }),
      ),
    );

    const total = await this.prisma.moodEntry.count({ where: { userId } });
    return ok(
      {
        diterima: dto.entries.length,
        disimpan: perTanggal.size,
        duplikatDalamPayload: dto.entries.length - perTanggal.size,
        totalTersimpan: total,
      },
      `${perTanggal.size} catatan mood tersinkron`,
    );
  }

  // ─── Insight ─────────────────────────────────────────────────────────

  async insight(userId: string): Promise<ResponsePayload<unknown>> {
    const [rows, periods] = await this.prisma.$transaction([
      this.prisma.moodEntry.findMany({
        where: { userId },
        orderBy: { tanggal: 'desc' },
        take: 400,
      }),
      this.prisma.haidPeriod.findMany({
        where: { userId },
        orderBy: { mulai: 'desc' },
        take: 24,
        select: { jenis: true, mulai: true, selesai: true },
      }),
    ]);

    const records: MoodRecord[] = rows.map((r) => ({
      tanggal: r.tanggal,
      mood: r.mood,
      flow: r.flow,
      symptoms: parseSymptoms(r.symptoms),
    }));
    const ringkas = periods.map((p) => ({
      jenis: p.jenis,
      mulai: p.mulai.toISOString().slice(0, 10),
      selesai: p.selesai ? p.selesai.toISOString().slice(0, 10) : null,
    }));

    return ok(hitungInsight(records, ringkas), 'Insight mood & gejala');
  }
}
