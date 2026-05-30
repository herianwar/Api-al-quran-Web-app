import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { createHash, randomBytes } from 'crypto';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AiService, ChatMessage } from './ai.service';

export interface SearchHit {
  ayatId: number;
  surahId: number;
  surahNomor: number;
  surahNamaLatin: string;
  nomorAyat: number;
  teksArab: string;
  teksIndonesia: string;
  /** Tafsir Kemenag excerpt (first ~260 chars). Null when not available. */
  tafsirSnippet: string | null;
  /** Combined hybrid score in [0, 1] (1 = perfect). */
  score: number;
  matchedVia: 'semantic' | 'text' | 'both';
}

export interface AskResponse {
  q: string;
  conversationId: string;
  hits: SearchHit[];
  summary?: string;
  noResultReason?: string;
}

interface ConversationTurn {
  q: string;
  hitIds?: number[];
}

interface RrfPair {
  ayatId: number;
  semanticRank?: number;
  textRank?: number;
  semanticScore?: number;
}

const RRF_K = 60;

/** OpenAI rate-card (per 1M token, USD). Used by the cost dashboard.
 *  Update when OpenAI changes pricing. */
export const OPENAI_PRICING: Record<string, { in: number; out: number }> = {
  'text-embedding-3-small': { in: 0.02, out: 0 },
  'text-embedding-3-large': { in: 0.13, out: 0 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
};

@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly settings: SettingsService,
  ) {}

  async ask(
    q: string,
    opts: {
      limit?: number;
      conversationId?: string;
      conversationHistory?: ConversationTurn[];
      withSummary?: boolean;
      userId?: string;
      req?: Request;
    } = {},
  ): Promise<ResponsePayload<AskResponse>> {
    const t0 = Date.now();
    const limit = Math.min(50, Math.max(1, opts.limit ?? 8));
    const conversationId = opts.conversationId || this.randomConvId();

    const cfgKeys = [
      'ai.score_threshold',
      'ai.summary_enabled',
      'ai.llm_model',
      'ai.embedding_model',
    ];
    const cfg = await this.settings.getMany(cfgKeys);
    const threshold = parseFloat(cfg['ai.score_threshold'] || '0.3');
    const summaryEnabledGlobally =
      (cfg['ai.summary_enabled'] || 'true').toLowerCase() === 'true';
    const wantSummary = opts.withSummary !== false && summaryEnabledGlobally;

    let embedTokens = 0;
    let llmTokensIn = 0;
    let llmTokensOut = 0;
    let cached = false;
    let topScore: number | null = null;
    let summary: string | undefined;
    let noResultReason: string | undefined;
    let embedModel = '';
    let llmModel = '';
    let hits: SearchHit[] = [];

    try {
      // Strip filler prefixes ("ayat tentang …") so the embedding focuses
      // on the actual topic. Cheap, no LLM needed.
      const cleaned = q
        .replace(/^(ayat|hadis|q\.s\.|qs)\s+(tentang|mengenai|soal)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      // 1. Query embedding (cached).
      const embed = await this.ai.embedQueryCached(cleaned || q);
      embedTokens = embed.tokensUsed;
      cached = embed.cached;
      embedModel = embed.model;

      if (!embed.vector || embed.vector.length === 0) {
        noResultReason = 'empty_embedding';
      } else {
        // 2. Parallel hybrid: semantic + text.
        const [semantic, text] = await Promise.all([
          this.runSemantic(embed.vector, limit * 3),
          this.runText(cleaned || q, limit * 3),
        ]);

        // 3. Reciprocal Rank Fusion.
        const pairs = new Map<number, RrfPair>();
        semantic.forEach((row, idx) => {
          pairs.set(row.ayatId, {
            ayatId: row.ayatId,
            semanticRank: idx,
            semanticScore: row.score,
          });
        });
        text.forEach((row, idx) => {
          const prev = pairs.get(row.ayatId) ?? { ayatId: row.ayatId };
          prev.textRank = idx;
          pairs.set(row.ayatId, prev);
        });

        const fused = [...pairs.values()]
          .map((p) => {
            const rrfSem =
              typeof p.semanticRank === 'number'
                ? 1 / (RRF_K + p.semanticRank)
                : 0;
            const rrfTxt =
              typeof p.textRank === 'number' ? 1 / (RRF_K + p.textRank) : 0;
            const rrf = rrfSem + rrfTxt;
            // Blend RRF (rank-based) with raw semantic similarity so the
            // displayed score stays meaningful in [0, 1].
            const blended =
              p.semanticScore !== undefined
                ? 0.6 * p.semanticScore + 0.4 * rrf * 24
                : rrf * 24;
            return {
              ayatId: p.ayatId,
              score: Math.max(0, Math.min(1, blended)),
              matchedVia:
                p.semanticRank !== undefined && p.textRank !== undefined
                  ? ('both' as const)
                  : p.semanticRank !== undefined
                    ? ('semantic' as const)
                    : ('text' as const),
            };
          })
          .filter((r) => r.score >= threshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        topScore = fused[0]?.score ?? null;

        if (fused.length > 0) {
          hits = await this.hydrate(fused);
        } else {
          noResultReason = 'below_threshold';
        }
      }

      // 4. Optional GPT summary.
      if (wantSummary && hits.length > 0) {
        try {
          const llm = await this.summarise(q, hits, opts.conversationHistory);
          summary = llm.text;
          llmTokensIn = llm.tokensIn;
          llmTokensOut = llm.tokensOut;
          llmModel = llm.model;
        } catch (err) {
          this.logger.warn(
            `Summary generation failed: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      // Fire-and-forget logging.
      void this.logQuery({
        q,
        conversationId,
        hits,
        topScore,
        embedTokens,
        llmTokensIn,
        llmTokensOut,
        embedModel,
        llmModel,
        cached,
        withSummary: !!summary,
        latencyMs: Date.now() - t0,
        userId: opts.userId,
        req: opts.req,
      });
    }

    return ok(
      {
        q,
        conversationId,
        hits,
        summary,
        noResultReason,
      },
      hits.length > 0
        ? `${hits.length} ayat ditemukan`
        : 'Tidak ada ayat yang cukup relevan',
      {
        cached,
        embedTokens,
        llmTokensIn,
        llmTokensOut,
        embedModel,
        llmModel,
        latencyMs: Date.now() - t0,
        threshold,
      },
    );
  }

  private async runSemantic(
    queryVec: number[],
    n: number,
  ): Promise<{ ayatId: number; score: number }[]> {
    const vec = `[${queryVec.join(',')}]`;
    const rows = await this.prisma.$queryRaw<
      { ayatId: number; distance: number }[]
    >(Prisma.sql`
      SELECT "ayatId", (embedding <=> ${vec}::vector)::float8 AS distance
      FROM ayat_embeddings
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${n}
    `);
    return rows.map((r) => ({
      ayatId: r.ayatId,
      score: Math.max(0, Math.min(1, 1 - r.distance)),
    }));
  }

  private async runText(
    q: string,
    n: number,
  ): Promise<{ ayatId: number }[]> {
    const cleaned = q.trim();
    if (cleaned.length < 2) return [];
    try {
      const rows = await this.prisma.$queryRaw<{ ayatId: number }[]>(Prisma.sql`
        SELECT id AS "ayatId"
        FROM ayat
        WHERE "teksIndonesia" ILIKE ${'%' + cleaned + '%'}
        ORDER BY similarity("teksIndonesia", ${cleaned}) DESC NULLS LAST
        LIMIT ${n}
      `);
      return rows;
    } catch {
      // pg_trgm extension may not be enabled — degrade to ILIKE only.
      try {
        const rows = await this.prisma.$queryRaw<{ ayatId: number }[]>(Prisma.sql`
          SELECT id AS "ayatId"
          FROM ayat
          WHERE "teksIndonesia" ILIKE ${'%' + cleaned + '%'}
          LIMIT ${n}
        `);
        return rows;
      } catch {
        return [];
      }
    }
  }

  private async hydrate(
    fused: { ayatId: number; score: number; matchedVia: SearchHit['matchedVia'] }[],
  ): Promise<SearchHit[]> {
    const ids = fused.map((f) => f.ayatId);
    const ayatRows = await this.prisma.ayat.findMany({
      where: { id: { in: ids } },
      include: {
        surah: { select: { id: true, nomor: true, namaLatin: true } },
      },
    });
    const tafsirRows = await this.prisma.tafsirAyat.findMany({
      where: { ayatId: { in: ids }, tafsir: { sumber: 'kemenag' } },
      select: { ayatId: true, teks: true },
    });
    const tafsirByAyat = new Map(tafsirRows.map((t) => [t.ayatId, t.teks]));
    const ayatById = new Map(ayatRows.map((a) => [a.id, a]));

    const out: SearchHit[] = [];
    for (const f of fused) {
      const a = ayatById.get(f.ayatId);
      if (!a) continue;
      const tafsirFull = tafsirByAyat.get(a.id);
      const tafsirSnippet = tafsirFull
        ? tafsirFull.length > 260
          ? `${tafsirFull.slice(0, 260).trim()}…`
          : tafsirFull
        : null;
      out.push({
        ayatId: a.id,
        surahId: a.surahId,
        surahNomor: a.surah.nomor,
        surahNamaLatin: a.surah.namaLatin,
        nomorAyat: a.nomorAyat,
        teksArab: a.teksArab,
        teksIndonesia: a.teksIndonesia,
        tafsirSnippet,
        score: f.score,
        matchedVia: f.matchedVia,
      });
    }
    return out;
  }

  /**
   * 1-2 sentence Indonesian summary tying the user query to the top ayat.
   * Conversation history included so follow-ups feel coherent. Firm system
   * prompt: stay neutral, cite Q.S., never invent ayat.
   */
  private async summarise(
    q: string,
    hits: SearchHit[],
    history?: ConversationTurn[],
  ): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          "Anda adalah asisten Al-Qur'an. Tugas: berikan ringkasan 1-2 kalimat bahasa Indonesia yang menjelaskan bagaimana ayat-ayat di bawah ini menjawab pertanyaan user. Aturan: (a) sebut Q.S. yang paling relevan dengan format \"Q.S. Nama Surah AYAT\". (b) JANGAN mengarang ayat atau hukum. (c) Tetap netral, hindari klaim tafsir kontroversial. (d) Maks 2 kalimat. (e) Jika ayat-ayat tidak relevan dengan pertanyaan, katakan \"tidak ada ayat yang sangat relevan, coba istilah lain\".",
      },
    ];

    if (history && history.length > 0) {
      for (const turn of history.slice(-3)) {
        messages.push({ role: 'user', content: turn.q });
        messages.push({
          role: 'assistant',
          content:
            turn.hitIds && turn.hitIds.length > 0
              ? `[merespons dengan ${turn.hitIds.length} ayat]`
              : '[tidak ada hasil]',
        });
      }
    }

    const ayatList = hits
      .slice(0, 5)
      .map(
        (h, i) =>
          `${i + 1}. Q.S. ${h.surahNamaLatin} ${h.surahNomor}:${h.nomorAyat} — "${h.teksIndonesia.slice(0, 240)}"`,
      )
      .join('\n');

    messages.push({
      role: 'user',
      content: `Pertanyaan: "${q}"\n\nAyat-ayat paling relevan:\n${ayatList}\n\nTulis ringkasan 1-2 kalimat.`,
    });

    const res = await this.ai.chat({ messages, maxTokens: 200, temperature: 0.3 });
    return {
      text: res.text,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      model: res.model,
    };
  }

  private async logQuery(args: {
    q: string;
    conversationId: string;
    hits: SearchHit[];
    topScore: number | null;
    embedTokens: number;
    llmTokensIn: number;
    llmTokensOut: number;
    embedModel: string;
    llmModel: string;
    cached: boolean;
    withSummary: boolean;
    latencyMs: number;
    userId?: string;
    req?: Request;
  }): Promise<void> {
    try {
      const ipHeader =
        (args.req?.headers['x-forwarded-for'] as string) ||
        args.req?.socket?.remoteAddress ||
        '';
      const ipParts =
        ipHeader.split(',')[0]?.split('.').slice(0, 2).join('.') ?? '';
      const ua =
        ((args.req?.headers['user-agent'] as string) ?? '').slice(0, 40);
      const clientHint = ipParts
        ? createHash('sha256')
            .update(`${ipParts}|${ua}`)
            .digest('hex')
            .slice(0, 12)
        : null;

      await this.prisma.aiQuery.create({
        data: {
          query: args.q.slice(0, 500).toLowerCase().trim(),
          userId: args.userId ?? null,
          conversationId: args.conversationId,
          resultCount: args.hits.length,
          topScore: args.topScore,
          embedTokens: args.embedTokens,
          llmTokensIn: args.llmTokensIn,
          llmTokensOut: args.llmTokensOut,
          embedModel: args.embedModel || null,
          llmModel: args.llmModel || null,
          cached: args.cached,
          withSummary: args.withSummary,
          latencyMs: args.latencyMs,
          clientHint,
        },
      });
    } catch (err) {
      this.logger.warn(`logQuery failed: ${(err as Error).message}`);
    }
  }

  private randomConvId(): string {
    return randomBytes(6).toString('hex');
  }

  // ─── Admin helpers ──────────────────────────────────────────────────

  async coverage(): Promise<ResponsePayload<unknown>> {
    const [totalAyat, withEmbedding, lastModel] = await Promise.all([
      this.prisma.ayat.count(),
      this.prisma.ayatEmbedding.count(),
      this.prisma.ayatEmbedding.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { model: true, dim: true, updatedAt: true },
      }),
    ]);
    return ok(
      {
        totalAyat,
        withEmbedding,
        percent:
          totalAyat > 0
            ? Math.round((withEmbedding / totalAyat) * 1000) / 10
            : 0,
        model: lastModel?.model ?? null,
        dim: lastModel?.dim ?? null,
        lastUpdate: lastModel?.updatedAt ?? null,
      },
      'Embedding coverage',
    );
  }

  /**
   * Aggregate cost + usage from ai_queries, evaluated against the OpenAI
   * rate card. `rangeDays` accepts 1, 7, 30, 90.
   */
  async cost(rangeDays = 30): Promise<ResponsePayload<unknown>> {
    const days = [1, 7, 30, 90].includes(rangeDays) ? rangeDays : 30;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const daily = await this.prisma.$queryRaw<
      {
        d: Date;
        queries: bigint;
        cached: bigint;
        embedTokens: bigint;
        llmIn: bigint;
        llmOut: bigint;
        avgLatency: number;
      }[]
    >`
      SELECT
        date_trunc('day', "createdAt") AS d,
        count(*)                                AS queries,
        sum(case when "cached" then 1 else 0 end) AS cached,
        sum("embedTokens")::bigint              AS "embedTokens",
        sum("llmTokensIn")::bigint              AS "llmIn",
        sum("llmTokensOut")::bigint             AS "llmOut",
        avg("latencyMs")::float                 AS "avgLatency"
      FROM ai_queries
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const perModel = await this.prisma.$queryRaw<
      {
        model: string;
        kind: string;
        tokensIn: bigint;
        tokensOut: bigint;
      }[]
    >`
      SELECT model, kind, "tokensIn"::bigint AS "tokensIn", "tokensOut"::bigint AS "tokensOut"
      FROM (
        SELECT "embedModel" AS model, 'embed' AS kind,
               sum("embedTokens") AS "tokensIn", 0 AS "tokensOut"
        FROM ai_queries
        WHERE "createdAt" >= ${since} AND "embedModel" IS NOT NULL
        GROUP BY 1
        UNION ALL
        SELECT "llmModel" AS model, 'llm' AS kind,
               sum("llmTokensIn") AS "tokensIn", sum("llmTokensOut") AS "tokensOut"
        FROM ai_queries
        WHERE "createdAt" >= ${since} AND "llmModel" IS NOT NULL
        GROUP BY 1
      ) x
      ORDER BY ("tokensIn" + "tokensOut") DESC
    `;

    function costForModel(
      model: string | null,
      tokensIn: number,
      tokensOut: number,
    ): number {
      if (!model) return 0;
      const direct = OPENAI_PRICING[model];
      const rates =
        direct ??
        OPENAI_PRICING[
          Object.keys(OPENAI_PRICING).find((k) => model.startsWith(k)) ?? ''
        ];
      if (!rates) return 0;
      return (
        (tokensIn / 1_000_000) * rates.in +
        (tokensOut / 1_000_000) * rates.out
      );
    }

    const perModelWithCost = perModel.map((m) => ({
      model: m.model,
      kind: m.kind,
      tokensIn: Number(m.tokensIn),
      tokensOut: Number(m.tokensOut),
      costUsd: costForModel(m.model, Number(m.tokensIn), Number(m.tokensOut)),
    }));
    const totalCostUsd = perModelWithCost.reduce((s, x) => s + x.costUsd, 0);

    const dailyOut = daily.map((d) => ({
      date: d.d.toISOString().slice(0, 10),
      queries: Number(d.queries),
      cached: Number(d.cached),
      embedTokens: Number(d.embedTokens),
      llmTokensIn: Number(d.llmIn),
      llmTokensOut: Number(d.llmOut),
      avgLatencyMs: Math.round(d.avgLatency),
    }));

    const budgetStr = await this.settings.get('ai.budget_monthly_usd');
    const budgetUsd = parseFloat(budgetStr || '0');

    const [totalQueries, cachedQueries] = await Promise.all([
      this.prisma.aiQuery.count({ where: { createdAt: { gte: since } } }),
      this.prisma.aiQuery.count({
        where: { createdAt: { gte: since }, cached: true },
      }),
    ]);

    return ok(
      {
        rangeDays: days,
        totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
        totalQueries,
        cachedQueries,
        cacheHitRate:
          totalQueries > 0
            ? Math.round((cachedQueries / totalQueries) * 1000) / 10
            : 0,
        budgetUsd,
        budgetUsedPct:
          budgetUsd > 0
            ? Math.round((totalCostUsd / budgetUsd) * 1000) / 10
            : 0,
        daily: dailyOut,
        perModel: perModelWithCost,
      },
      'AI cost & usage',
    );
  }

  async queries(
    page = 1,
    limit = 50,
    onlyNoResults = false,
  ): Promise<ResponsePayload<unknown>> {
    const skip = Math.max(0, (page - 1) * limit);
    const take = Math.min(200, limit);
    const where: Prisma.AiQueryWhereInput = onlyNoResults
      ? { OR: [{ resultCount: 0 }, { topScore: { lt: 0.3 } }] }
      : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.aiQuery.count({ where }),
      this.prisma.aiQuery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          query: true,
          resultCount: true,
          topScore: true,
          embedTokens: true,
          llmTokensIn: true,
          llmTokensOut: true,
          cached: true,
          withSummary: true,
          latencyMs: true,
          createdAt: true,
        },
      }),
    ]);

    const topQueries = await this.prisma.$queryRaw<
      { query: string; cnt: bigint; avgScore: number | null }[]
    >`
      SELECT query, count(*)::bigint AS cnt, avg("topScore")::float AS "avgScore"
      FROM ai_queries
      WHERE "createdAt" >= now() - interval '30 days'
      GROUP BY query
      ORDER BY cnt DESC
      LIMIT 20
    `;
    const gaps = await this.prisma.$queryRaw<
      { query: string; cnt: bigint }[]
    >`
      SELECT query, count(*)::bigint AS cnt
      FROM ai_queries
      WHERE "createdAt" >= now() - interval '30 days'
        AND ("resultCount" = 0 OR "topScore" < 0.3)
      GROUP BY query
      ORDER BY cnt DESC
      LIMIT 20
    `;

    return ok(
      {
        items: rows.map((r) => ({
          ...r,
          id: r.id.toString(),
        })),
        topQueries: topQueries.map((t) => ({
          query: t.query,
          count: Number(t.cnt),
          avgScore: t.avgScore,
        })),
        gapQueries: gaps.map((g) => ({
          query: g.query,
          count: Number(g.cnt),
        })),
      },
      'AI queries',
      {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore: skip + take < total,
      },
    );
  }
}
