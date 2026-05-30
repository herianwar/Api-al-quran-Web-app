import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { SettingsService } from '../settings/settings.service';

interface EmbeddingRequest {
  input: string[];
  /** Override the model that's configured in AppSetting. */
  model?: string;
}

interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dim: number;
  tokensUsed: number;
}

interface OpenAiEmbedResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

interface OpenAiChatResponse {
  choices: { message: { content: string } }[];
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Provider-agnostic wrapper. Currently OpenAI; adding a provider (Gemini,
 * local) means another branch in `embed()` / `chat()`.
 *
 * Embedding queries are cached in Redis (sha256(query+model) key, 7-day
 * TTL) so popular searches don't cost a network round-trip every time.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  /** Query-embedding cache TTL — 7 days. */
  private static readonly QUERY_CACHE_TTL_S = 7 * 24 * 3600;

  constructor(
    private readonly settings: SettingsService,
    private readonly redis: RedisService,
  ) {}

  async embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
    const cfg = await this.settings.getMany([
      'ai.provider',
      'ai.openai_api_key',
      'ai.openai_base_url',
      'ai.embedding_model',
    ]);
    const provider = cfg['ai.provider'] || 'openai';
    if (provider !== 'openai') {
      throw new ServiceUnavailableException({
        message: `Provider "${provider}" belum di-support.`,
        error: 'AI_UNAVAILABLE',
      });
    }
    return this.embedOpenAi(req, cfg);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const cfg = await this.settings.getMany([
      'ai.provider',
      'ai.openai_api_key',
      'ai.openai_base_url',
      'ai.llm_model',
    ]);
    const provider = cfg['ai.provider'] || 'openai';
    if (provider !== 'openai') {
      throw new ServiceUnavailableException({
        message: `Provider "${provider}" belum di-support.`,
        error: 'AI_UNAVAILABLE',
      });
    }
    return this.chatOpenAi(req, cfg);
  }

  /**
   * Single-query embedding with Redis cache. Use this from the search
   * service so popular queries (~"ayat tentang sabar") hit cache. Seed
   * jobs should still call `embed()` directly to amortise the batch call.
   */
  async embedQueryCached(query: string): Promise<{
    vector: number[];
    model: string;
    dim: number;
    tokensUsed: number;
    cached: boolean;
  }> {
    const cfg = await this.settings.getMany(['ai.embedding_model']);
    const model = cfg['ai.embedding_model'] || 'text-embedding-3-small';
    const normalised = query.trim().toLowerCase();
    const cacheKey = `ai:embed:${model}:${createHash('sha256').update(normalised).digest('hex').slice(0, 32)}`;
    const cached = await this.redis.get<{
      v: number[];
      m: string;
      d: number;
    }>(cacheKey);
    if (cached) {
      return {
        vector: cached.v,
        model: cached.m,
        dim: cached.d,
        tokensUsed: 0,
        cached: true,
      };
    }
    const res = await this.embed({ input: [query] });
    const vector = res.vectors[0];
    if (vector && vector.length > 0) {
      await this.redis.set(
        cacheKey,
        { v: vector, m: res.model, d: res.dim },
        AiService.QUERY_CACHE_TTL_S,
      );
    }
    return {
      vector: vector ?? [],
      model: res.model,
      dim: res.dim,
      tokensUsed: res.tokensUsed,
      cached: false,
    };
  }

  private async embedOpenAi(
    req: EmbeddingRequest,
    cfg: Record<string, string>,
  ): Promise<EmbeddingResult> {
    const apiKey = cfg['ai.openai_api_key'];
    if (!apiKey) {
      throw new ServiceUnavailableException({
        message:
          'OpenAI API key belum di-set. Atur di /admin/settings/ai dulu.',
        error: 'AI_UNCONFIGURED',
      });
    }
    const baseUrl = cfg['ai.openai_base_url'] || 'https://api.openai.com/v1';
    const model =
      req.model || cfg['ai.embedding_model'] || 'text-embedding-3-small';

    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: req.input }),
    });
    if (!res.ok) {
      const txt = await res.text();
      this.logger.warn(
        `OpenAI embed failed: ${res.status} ${txt.slice(0, 200)}`,
      );
      throw new ServiceUnavailableException({
        message: `OpenAI error ${res.status}: ${txt.slice(0, 300)}`,
        error: 'AI_PROVIDER_ERROR',
      });
    }
    const json = (await res.json()) as OpenAiEmbedResponse;
    const vectors = [...json.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    const dim = vectors[0]?.length ?? 0;
    return {
      vectors,
      model: json.model,
      dim,
      tokensUsed: json.usage?.total_tokens ?? 0,
    };
  }

  private async chatOpenAi(
    req: ChatRequest,
    cfg: Record<string, string>,
  ): Promise<ChatResult> {
    const apiKey = cfg['ai.openai_api_key'];
    if (!apiKey) {
      throw new ServiceUnavailableException({
        message:
          'OpenAI API key belum di-set. Atur di /admin/settings/ai dulu.',
        error: 'AI_UNCONFIGURED',
      });
    }
    const baseUrl = cfg['ai.openai_base_url'] || 'https://api.openai.com/v1';
    const model = req.model || cfg['ai.llm_model'] || 'gpt-4o-mini';

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? 220,
        temperature: req.temperature ?? 0.3,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      this.logger.warn(
        `OpenAI chat failed: ${res.status} ${txt.slice(0, 200)}`,
      );
      throw new ServiceUnavailableException({
        message: `OpenAI error ${res.status}: ${txt.slice(0, 300)}`,
        error: 'AI_PROVIDER_ERROR',
      });
    }
    const json = (await res.json()) as OpenAiChatResponse;
    return {
      text: json.choices[0]?.message?.content?.trim() ?? '',
      model: json.model,
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
    };
  }
}
