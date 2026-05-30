import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  PaginationQueryDto,
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { AiService } from '../ai/ai.service';

/** Threshold for accepting an embedding-discovered ayat as an AI-extra
 *  link. Tuned from the existing search threshold (0.30) — slightly
 *  stricter here because topic-extra ayat are *added permanently*. */
const AI_EXPAND_THRESHOLD = 0.35;
/** Cap how many AI-extra ayat we attach per topic so the page stays sane.
 *  Curated stays untouched; this is the upper bound for the AI section. */
const AI_EXPAND_LIMIT = 40;
/** When computing related topics via centroid distance, return this many. */
const RELATED_LIMIT = 5;

interface ReadingPlanDay {
  day: number;
  tema: string;
  ayatIds: number[];
}

@Injectable()
export class TopicService {
  private readonly logger = new Logger(TopicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
  ) {}

  // ─── Public read endpoints ──────────────────────────────────────────

  async list(): Promise<ResponsePayload<unknown>> {
    const { data, cached } = await this.redis.remember(
      'topic:list:v2',
      CacheTtl.SURAH_LIST,
      async () => {
        const rows = await this.prisma.topic.findMany({
          orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
          select: {
            id: true,
            slug: true,
            nama: true,
            deskripsi: true,
            aiSummary: true,
            ayatLinks: { select: { source: true } },
          },
        });
        return rows.map((r) => {
          const curated = r.ayatLinks.filter((a) => a.source === 'curated').length;
          const ai = r.ayatLinks.filter((a) => a.source === 'ai').length;
          return {
            slug: r.slug,
            nama: r.nama,
            deskripsi: r.deskripsi,
            aiSummary: r.aiSummary,
            jumlahAyat: curated + ai,
            curatedCount: curated,
            aiCount: ai,
          };
        });
      },
    );
    return ok(data, 'Daftar topik', { total: data.length, cached });
  }

  /**
   * Enhanced topic detail: meta + AI summary + curated ayat count + ai count
   * + related topics. Ayat list itself paginated via /topic/:slug/ayat.
   */
  async detail(slug: string): Promise<ResponsePayload<unknown>> {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      include: {
        ayatLinks: { select: { source: true } },
      },
    });
    if (!topic) {
      throw new NotFoundException({
        message: `Topik "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const curatedCount = topic.ayatLinks.filter(
      (a) => a.source === 'curated',
    ).length;
    const aiCount = topic.ayatLinks.filter((a) => a.source === 'ai').length;
    const related = await this.computeRelated(topic.id);

    return ok(
      {
        slug: topic.slug,
        nama: topic.nama,
        deskripsi: topic.deskripsi,
        aiSummary: topic.aiSummary,
        aiSummaryAt: topic.aiSummaryAt,
        readingPlan: topic.readingPlan as ReadingPlanDay[] | null,
        readingPlanAt: topic.readingPlanAt,
        curatedCount,
        aiCount,
        related,
      },
      `Topik ${topic.nama}`,
    );
  }

  /**
   * Ayat in a topic. Filter by source ("curated" | "ai" | "all", default
   * "all"). Curated returned first, then AI sorted by aiScore desc.
   */
  async getAyat(
    slug: string,
    pagination: PaginationQueryDto,
    source: 'all' | 'curated' | 'ai' = 'all',
  ): Promise<ResponsePayload<unknown>> {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      select: { id: true, nama: true },
    });
    if (!topic) {
      throw new NotFoundException({
        message: `Topik "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const where: Prisma.TopicAyatWhereInput = {
      topicId: topic.id,
      ...(source !== 'all' ? { source } : {}),
    };
    const { skip, take } = paginationArgs(pagination);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.topicAyat.count({ where }),
      this.prisma.topicAyat.findMany({
        where,
        skip,
        take,
        // Curated first by Q.S. order; AI sorted by relevance.
        orderBy: [
          { source: 'asc' },
          { aiScore: 'desc' },
          { ayat: { surah: { nomor: 'asc' } } },
          { ayat: { nomorAyat: 'asc' } },
        ],
        select: {
          catatan: true,
          source: true,
          aiScore: true,
          ayat: {
            select: {
              id: true,
              nomorAyat: true,
              teksArab: true,
              teksLatin: true,
              teksIndonesia: true,
              surah: { select: { nomor: true, namaLatin: true, nama: true } },
            },
          },
        },
      }),
    ]);
    return ok(
      rows.map((r) => ({
        ...r.ayat,
        catatan: r.catatan,
        source: r.source,
        aiScore: r.aiScore,
      })),
      `Ayat dalam topik "${topic.nama}"`,
      paginationMeta(pagination, total),
    );
  }

  /**
   * Compute related topics via centroid embedding distance. Falls back to
   * "shared ayat overlap" when embeddings are missing.
   */
  private async computeRelated(
    topicId: number,
  ): Promise<{ slug: string; nama: string; score: number }[]> {
    try {
      const rows = await this.prisma.$queryRaw<
        { slug: string; nama: string; score: number }[]
      >(Prisma.sql`
        WITH this_topic AS (
          SELECT AVG(e.embedding) FILTER (WHERE e.embedding IS NOT NULL) AS centroid
          FROM topic_ayat ta
          JOIN ayat_embeddings e ON e."ayatId" = ta."ayatId"
          WHERE ta."topicId" = ${topicId}
        ),
        others AS (
          SELECT t.id, t.slug, t.nama,
                 AVG(e.embedding) FILTER (WHERE e.embedding IS NOT NULL) AS centroid
          FROM topics t
          JOIN topic_ayat ta ON ta."topicId" = t.id
          JOIN ayat_embeddings e ON e."ayatId" = ta."ayatId"
          WHERE t.id <> ${topicId}
          GROUP BY t.id, t.slug, t.nama
        )
        SELECT o.slug, o.nama,
               (1 - (o.centroid <=> (SELECT centroid FROM this_topic)))::float8 AS score
        FROM others o
        WHERE (SELECT centroid FROM this_topic) IS NOT NULL
        ORDER BY o.centroid <=> (SELECT centroid FROM this_topic) ASC
        LIMIT ${RELATED_LIMIT}
      `);
      return rows
        .filter((r) => r.score > 0.2)
        .map((r) => ({
          slug: r.slug,
          nama: r.nama,
          score: Math.max(0, Math.min(1, r.score)),
        }));
    } catch (err) {
      this.logger.warn(
        `Related-topic centroid query gagal, fallback overlap: ${(err as Error).message}`,
      );
      // Fallback: shared-ayat overlap (no embedding needed)
      const rows = await this.prisma.$queryRaw<
        { slug: string; nama: string; shared: bigint }[]
      >`
        SELECT t.slug, t.nama, count(*)::bigint AS shared
        FROM topic_ayat ta1
        JOIN topic_ayat ta2 ON ta2."ayatId" = ta1."ayatId" AND ta2."topicId" <> ta1."topicId"
        JOIN topics t ON t.id = ta2."topicId"
        WHERE ta1."topicId" = ${topicId}
        GROUP BY t.slug, t.nama
        ORDER BY shared DESC
        LIMIT ${RELATED_LIMIT}
      `;
      return rows
        .filter((r) => Number(r.shared) > 0)
        .map((r) => ({
          slug: r.slug,
          nama: r.nama,
          score: Math.min(1, Number(r.shared) / 10),
        }));
    }
  }

  // ─── Topic-scoped semantic ask ──────────────────────────────────────

  /**
   * Run a semantic search scoped to a topic's ayat pool. Behaves like
   * /quran/ask but restricts hits to ayat already linked to the topic.
   */
  async ask(
    slug: string,
    q: string,
    limit = 6,
  ): Promise<ResponsePayload<unknown>> {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      select: {
        id: true,
        nama: true,
        ayatLinks: { select: { ayatId: true } },
      },
    });
    if (!topic) {
      throw new NotFoundException({
        message: `Topik "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const ayatIds = topic.ayatLinks.map((a) => a.ayatId);
    if (ayatIds.length === 0) {
      return ok(
        { q, hits: [], message: 'Topik belum punya ayat.' },
        'Topik kosong',
      );
    }

    let queryVec: number[] = [];
    let tokensUsed = 0;
    let cached = false;
    try {
      const embed = await this.ai.embedQueryCached(q);
      queryVec = embed.vector;
      tokensUsed = embed.tokensUsed;
      cached = embed.cached;
    } catch (err) {
      this.logger.warn(`Topic ask embed gagal: ${(err as Error).message}`);
      return ok(
        { q, hits: [], message: 'AI search belum dikonfigurasi.' },
        'AI unavailable',
      );
    }
    if (queryVec.length === 0) {
      return ok({ q, hits: [] }, 'Tidak ada hasil');
    }

    const vec = `[${queryVec.join(',')}]`;
    const rows = await this.prisma.$queryRaw<
      {
        ayatId: number;
        surahNomor: number;
        surahNamaLatin: string;
        nomorAyat: number;
        teksArab: string;
        teksIndonesia: string;
        distance: number;
      }[]
    >(Prisma.sql`
      SELECT
        e."ayatId"                                 AS "ayatId",
        s."nomor"                                  AS "surahNomor",
        s."namaLatin"                              AS "surahNamaLatin",
        a."nomorAyat"                              AS "nomorAyat",
        a."teksArab"                               AS "teksArab",
        a."teksIndonesia"                          AS "teksIndonesia",
        (e.embedding <=> ${vec}::vector)::float8   AS "distance"
      FROM ayat_embeddings e
      JOIN ayat   a ON a.id       = e."ayatId"
      JOIN surahs s ON s.id       = a."surahId"
      WHERE e."ayatId" IN (${Prisma.join(ayatIds)})
        AND e.embedding IS NOT NULL
      ORDER BY e.embedding <=> ${vec}::vector
      LIMIT ${limit}
    `);
    const hits = rows.map((r) => ({
      ayatId: r.ayatId,
      surahNomor: r.surahNomor,
      surahNamaLatin: r.surahNamaLatin,
      nomorAyat: r.nomorAyat,
      teksArab: r.teksArab,
      teksIndonesia: r.teksIndonesia,
      score: Math.max(0, Math.min(1, 1 - r.distance)),
    }));
    return ok({ q, hits }, `${hits.length} ayat di topik "${topic.nama}"`, {
      tokensUsed,
      cached,
    });
  }

  // ─── Admin: AI summary / expansion / plan ───────────────────────────

  /**
   * Generate (or regenerate) an AI summary for a topic, using its ayat as
   * grounding. Caches result in `topics.aiSummary`. Idempotent — re-running
   * always produces fresh, model-of-the-moment output.
   */
  async regenerateSummary(
    slug: string,
  ): Promise<ResponsePayload<unknown>> {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      include: {
        ayatLinks: {
          where: { source: 'curated' },
          take: 10,
          include: {
            ayat: {
              select: {
                teksIndonesia: true,
                nomorAyat: true,
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
    if (topic.ayatLinks.length === 0) {
      throw new NotFoundException({
        message: 'Topik belum punya ayat curated — tidak ada grounding.',
        error: 'NOT_FOUND',
      });
    }
    const ayatList = topic.ayatLinks
      .map(
        (a, i) =>
          `${i + 1}. Q.S. ${a.ayat.surah.namaLatin} ${a.ayat.surah.nomor}:${a.ayat.nomorAyat} — "${a.ayat.teksIndonesia.slice(0, 220)}"`,
      )
      .join('\n');

    const res = await this.ai.chat({
      messages: [
        {
          role: 'system',
          content:
            'Anda adalah ulama yang menulis ringkasan tematik Al-Qur\'an dalam bahasa Indonesia. Tugas: dari topik dan ayat-ayat di bawah ini, tulis ringkasan 2-3 kalimat. Aturan: (a) sebut 2-3 Q.S. paling representatif dengan format "Q.S. Nama AYAT". (b) jangan mengarang ayat atau hukum. (c) netral, tidak kontroversial. (d) bahasa formal yang mudah dipahami.',
        },
        {
          role: 'user',
          content: `Topik: ${topic.nama}\nDeskripsi: ${topic.deskripsi ?? '-'}\n\nAyat curated:\n${ayatList}\n\nTulis ringkasan 2-3 kalimat.`,
        },
      ],
      maxTokens: 280,
      temperature: 0.4,
    });

    const updated = await this.prisma.topic.update({
      where: { id: topic.id },
      data: {
        aiSummary: res.text,
        aiSummaryModel: res.model,
        aiSummaryAt: new Date(),
      },
    });
    await this.redis.del('topic:list:v2');
    return ok(
      {
        slug: updated.slug,
        aiSummary: updated.aiSummary,
        aiSummaryAt: updated.aiSummaryAt,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
      },
      'AI summary diperbarui',
    );
  }

  /**
   * Expand a topic's ayat pool with AI-discovered relevant ayat via
   * embedding similarity. New ayat saved with source="ai" and aiScore.
   * Existing curated ayat are never touched. Re-running replaces only
   * the AI-discovered subset.
   */
  async expandWithAi(slug: string): Promise<ResponsePayload<unknown>> {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        nama: true,
        deskripsi: true,
        ayatLinks: { select: { ayatId: true, source: true } },
      },
    });
    if (!topic) {
      throw new NotFoundException({
        message: `Topik "${slug}" tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const curatedIds = new Set(
      topic.ayatLinks
        .filter((a) => a.source === 'curated')
        .map((a) => a.ayatId),
    );

    // Build query: nama + deskripsi. Embedding fokus pada makna topik.
    const queryText = `${topic.nama}. ${topic.deskripsi ?? ''}`.trim();
    const embed = await this.ai.embedQueryCached(queryText);
    if (!embed.vector || embed.vector.length === 0) {
      throw new NotFoundException({
        message: 'Gagal embed query topik.',
        error: 'AI_UNAVAILABLE',
      });
    }

    // Pull AI_EXPAND_LIMIT * 3 candidates so we have room after filtering
    // out curated ones.
    const vec = `[${embed.vector.join(',')}]`;
    const candidates = await this.prisma.$queryRaw<
      { ayatId: number; distance: number }[]
    >(Prisma.sql`
      SELECT "ayatId", (embedding <=> ${vec}::vector)::float8 AS distance
      FROM ayat_embeddings
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${AI_EXPAND_LIMIT * 3}
    `);
    const fresh: { ayatId: number; score: number }[] = [];
    for (const c of candidates) {
      if (curatedIds.has(c.ayatId)) continue;
      const score = Math.max(0, Math.min(1, 1 - c.distance));
      if (score < AI_EXPAND_THRESHOLD) break; // results are sorted, no point continuing
      fresh.push({ ayatId: c.ayatId, score });
      if (fresh.length >= AI_EXPAND_LIMIT) break;
    }

    // Atomic replace of source="ai" rows.
    await this.prisma.$transaction([
      this.prisma.topicAyat.deleteMany({
        where: { topicId: topic.id, source: 'ai' },
      }),
      ...(fresh.length > 0
        ? [
            this.prisma.topicAyat.createMany({
              data: fresh.map((f) => ({
                topicId: topic.id,
                ayatId: f.ayatId,
                source: 'ai',
                aiScore: f.score,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    await this.redis.del('topic:list:v2');

    return ok(
      {
        slug: topic.slug,
        added: fresh.length,
        topScore: fresh[0]?.score ?? null,
        tokensUsed: embed.tokensUsed,
        cached: embed.cached,
      },
      fresh.length > 0
        ? `${fresh.length} ayat AI ditambahkan ke topik "${topic.nama}"`
        : 'Tidak ada ayat baru yang cukup relevan',
    );
  }

  /**
   * Generate a 7-day reading plan from a topic's curated ayat. Pure LLM
   * call grounded on the ayat list. Caches result in `topics.readingPlan`.
   */
  async generateReadingPlan(
    slug: string,
  ): Promise<ResponsePayload<unknown>> {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      include: {
        ayatLinks: {
          where: { source: 'curated' },
          include: {
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
    if (topic.ayatLinks.length === 0) {
      throw new NotFoundException({
        message: 'Topik belum punya ayat curated.',
        error: 'NOT_FOUND',
      });
    }

    // Build a numbered list of ayat with their internal IDs.
    const ayatList = topic.ayatLinks
      .map(
        (a) =>
          `[id=${a.ayat.id}] Q.S. ${a.ayat.surah.namaLatin} ${a.ayat.surah.nomor}:${a.ayat.nomorAyat} — "${a.ayat.teksIndonesia.slice(0, 200)}"`,
      )
      .join('\n');

    const res = await this.ai.chat({
      messages: [
        {
          role: 'system',
          content:
            'Anda menyusun rencana baca tematik 7 hari dari ayat-ayat curated. Bagi ayat ke dalam 7 hari secara seimbang (boleh 2-3 ayat per hari). Tiap hari beri tema 4-7 kata yang menjelaskan sub-tema hari itu. Output HARUS JSON valid sesuai schema:\n\n[{"day":1,"tema":"...","ayatIds":[123,456]},{"day":2,...},...,{"day":7,...}]\n\nGunakan id yang diberikan pada list ayat. JANGAN sebut id ayat di luar list. JANGAN tulis penjelasan di luar JSON.',
        },
        {
          role: 'user',
          content: `Topik: ${topic.nama}\nDeskripsi: ${topic.deskripsi ?? '-'}\n\nDaftar ayat:\n${ayatList}\n\nBuat rencana 7 hari dalam JSON.`,
        },
      ],
      maxTokens: 800,
      temperature: 0.3,
    });

    let plan: ReadingPlanDay[] = [];
    try {
      // Strip optional code fences and parse.
      const cleaned = res.text
        .replace(/^```(?:json)?/m, '')
        .replace(/```\s*$/m, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        // Validate shape + filter ids to those actually in topic.
        const allowed = new Set(topic.ayatLinks.map((a) => a.ayat.id));
        plan = parsed
          .filter(
            (d: unknown): d is { day: unknown; tema: unknown; ayatIds: unknown } =>
              typeof d === 'object' &&
              d !== null &&
              'day' in d &&
              'tema' in d &&
              'ayatIds' in d,
          )
          .map((d) => ({
            day: Number(d.day),
            tema: String(d.tema).slice(0, 120),
            ayatIds: Array.isArray(d.ayatIds)
              ? d.ayatIds
                  .map((x) => Number(x))
                  .filter((n) => allowed.has(n))
              : [],
          }))
          .filter((d) => d.day >= 1 && d.day <= 7 && d.ayatIds.length > 0);
      }
    } catch (err) {
      this.logger.warn(`Reading plan JSON parse gagal: ${(err as Error).message}`);
    }

    if (plan.length === 0) {
      throw new NotFoundException({
        message: 'Gagal memparse rencana — coba lagi.',
        error: 'AI_PARSE_ERROR',
      });
    }

    const updated = await this.prisma.topic.update({
      where: { id: topic.id },
      data: {
        readingPlan: plan as unknown as Prisma.InputJsonValue,
        readingPlanModel: res.model,
        readingPlanAt: new Date(),
      },
    });
    return ok(
      {
        slug: updated.slug,
        plan,
        readingPlanAt: updated.readingPlanAt,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
      },
      'Rencana baca diperbarui',
    );
  }

  // ─── Admin: batch operations + AI topic discovery ───────────────────

  /**
   * Run `expandWithAi` for every topic. Returns aggregate stats. Slow
   * (one embedding call per topic) but idempotent.
   */
  async expandAllWithAi(): Promise<ResponsePayload<unknown>> {
    const topics = await this.prisma.topic.findMany({ select: { slug: true } });
    const results: { slug: string; added: number; error?: string }[] = [];
    for (const t of topics) {
      try {
        const r = (await this.expandWithAi(t.slug)).data as
          | { added: number }
          | undefined;
        results.push({ slug: t.slug, added: r?.added ?? 0 });
      } catch (err) {
        results.push({
          slug: t.slug,
          added: 0,
          error: (err as Error).message,
        });
      }
    }
    return ok(
      {
        topicsProcessed: results.length,
        totalAdded: results.reduce((s, r) => s + r.added, 0),
        results,
      },
      'Expand all topics selesai',
    );
  }

  /**
   * Regenerate summary for every topic with at least 1 curated ayat. Slow
   * but acceptable for a one-shot admin action.
   */
  async regenerateAllSummaries(): Promise<ResponsePayload<unknown>> {
    const topics = await this.prisma.topic.findMany({
      select: { slug: true },
    });
    const results: { slug: string; ok: boolean; error?: string }[] = [];
    for (const t of topics) {
      try {
        await this.regenerateSummary(t.slug);
        results.push({ slug: t.slug, ok: true });
      } catch (err) {
        results.push({
          slug: t.slug,
          ok: false,
          error: (err as Error).message,
        });
      }
    }
    return ok(
      {
        processed: results.length,
        successful: results.filter((r) => r.ok).length,
        results,
      },
      'Regenerate all summaries selesai',
    );
  }

  /**
   * AI-discover candidate topics from un-categorised ayat. Picks N
   * "seed" ayat that aren't in any topic, finds each one's nearest
   * neighbors that are also un-categorised, and proposes the cluster.
   * Returns proposals — admin must approve/name before they become topics.
   */
  async discoverNewTopics(
    count = 5,
    clusterSize = 12,
  ): Promise<ResponsePayload<unknown>> {
    // Build the candidate pool: ayat that exist in `ayat_embeddings` and
    // are NOT linked to any topic yet.
    const seeds = await this.prisma.$queryRaw<
      { ayatId: number; surahNomor: number; nomorAyat: number; preview: string }[]
    >(Prisma.sql`
      SELECT e."ayatId" AS "ayatId",
             s.nomor    AS "surahNomor",
             a."nomorAyat" AS "nomorAyat",
             substr(a."teksIndonesia", 1, 100) AS preview
      FROM ayat_embeddings e
      JOIN ayat a   ON a.id      = e."ayatId"
      JOIN surahs s ON s.id      = a."surahId"
      WHERE e.embedding IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM topic_ayat ta WHERE ta."ayatId" = e."ayatId"
        )
      ORDER BY random()
      LIMIT ${count}
    `);

    const clusters: {
      seed: { ayatId: number; surahNomor: number; nomorAyat: number; preview: string };
      members: { ayatId: number; surahNomor: number; nomorAyat: number; preview: string; score: number }[];
    }[] = [];

    for (const seed of seeds) {
      const members = await this.prisma.$queryRaw<
        {
          ayatId: number;
          surahNomor: number;
          nomorAyat: number;
          preview: string;
          distance: number;
        }[]
      >(Prisma.sql`
        SELECT e."ayatId" AS "ayatId",
               s.nomor    AS "surahNomor",
               a."nomorAyat" AS "nomorAyat",
               substr(a."teksIndonesia", 1, 100) AS preview,
               (e.embedding <=> (
                 SELECT embedding FROM ayat_embeddings WHERE "ayatId" = ${seed.ayatId}
               ))::float8 AS distance
        FROM ayat_embeddings e
        JOIN ayat a   ON a.id      = e."ayatId"
        JOIN surahs s ON s.id      = a."surahId"
        WHERE e.embedding IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM topic_ayat ta WHERE ta."ayatId" = e."ayatId"
          )
          AND e."ayatId" <> ${seed.ayatId}
        ORDER BY e.embedding <=> (
          SELECT embedding FROM ayat_embeddings WHERE "ayatId" = ${seed.ayatId}
        )
        LIMIT ${clusterSize}
      `);
      clusters.push({
        seed,
        members: members.map((m) => ({
          ayatId: m.ayatId,
          surahNomor: m.surahNomor,
          nomorAyat: m.nomorAyat,
          preview: m.preview,
          score: Math.max(0, Math.min(1, 1 - m.distance)),
        })),
      });
    }

    // For each cluster, ask the LLM to propose a topic name + slug.
    const proposals: {
      suggestedSlug: string;
      suggestedNama: string;
      suggestedDeskripsi: string;
      seedAyatId: number;
      members: typeof clusters[number]['members'];
    }[] = [];
    for (const c of clusters) {
      try {
        const sample = c.members
          .slice(0, 6)
          .map(
            (m, i) =>
              `${i + 1}. Q.S. ${m.surahNomor}:${m.nomorAyat} — "${m.preview}"`,
          )
          .join('\n');
        const res = await this.ai.chat({
          messages: [
            {
              role: 'system',
              content:
                'Anda mengusulkan nama topik tematik Al-Qur\'an dari sekumpulan ayat. Output JSON valid:\n{"slug":"slug-kebab","nama":"Nama Topik","deskripsi":"1 kalimat singkat"}\nslug: 1-3 kata, kebab-case. nama: 1-3 kata Title Case. JANGAN tulis di luar JSON.',
            },
            {
              role: 'user',
              content: `Sample ayat:\n${sample}\n\nUsulkan topik.`,
            },
          ],
          maxTokens: 120,
          temperature: 0.3,
        });
        const cleaned = res.text
          .replace(/^```(?:json)?/m, '')
          .replace(/```\s*$/m, '')
          .trim();
        const parsed = JSON.parse(cleaned) as {
          slug?: string;
          nama?: string;
          deskripsi?: string;
        };
        if (parsed.slug && parsed.nama) {
          proposals.push({
            suggestedSlug: parsed.slug
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 60),
            suggestedNama: parsed.nama.slice(0, 80),
            suggestedDeskripsi: parsed.deskripsi?.slice(0, 280) ?? '',
            seedAyatId: c.seed.ayatId,
            members: c.members,
          });
        }
      } catch (err) {
        this.logger.warn(`Discover proposal gagal: ${(err as Error).message}`);
      }
    }

    return ok(
      { proposals },
      `${proposals.length} usulan topik baru`,
    );
  }
}
