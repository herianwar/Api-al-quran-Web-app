import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  decryptString,
  encryptString,
  maskSecret,
} from '../../common/crypto/aes-gcm';
import { PrismaService } from '../../prisma/prisma.service';

export interface SettingDef {
  key: string;
  label: string;
  category: string;
  isSecret: boolean;
}

/**
 * Catalogue of known settings. The categories drive the admin UI:
 *  - "ai": shown front-and-centre — admin only needs to paste an API key.
 *  - "ai-advanced": hidden behind "Pengaturan lanjutan" toggle (rarely changed).
 *  - "ai-internal": never shown to admin — auto-managed by the system.
 *    `embedding_dim` lives here because it is derived from the actual API
 *    response, not user-typed (a previous UI iteration let one user paste
 *    their email there by mistake).
 */
export const SETTING_DEFS: SettingDef[] = [
  {
    key: 'ai.openai_api_key',
    label: 'OpenAI API key',
    category: 'ai',
    isSecret: true,
  },
  {
    key: 'ai.embedding_model',
    label: 'Embedding model',
    category: 'ai-advanced',
    isSecret: false,
  },
  {
    key: 'ai.openai_base_url',
    label: 'OpenAI base URL (override)',
    category: 'ai-advanced',
    isSecret: false,
  },
  {
    key: 'ai.llm_model',
    label: 'LLM model untuk summary',
    category: 'ai-advanced',
    isSecret: false,
  },
  {
    key: 'ai.summary_enabled',
    label: 'Aktifkan AI summary di /tanya (true/false)',
    category: 'ai-advanced',
    isSecret: false,
  },
  {
    key: 'ai.score_threshold',
    label: 'Skor minimum hasil (0..1, default 0.3)',
    category: 'ai-advanced',
    isSecret: false,
  },
  {
    key: 'ai.budget_monthly_usd',
    label: 'Budget bulanan AI dalam USD (0 = tanpa batas)',
    category: 'ai-advanced',
    isSecret: false,
  },
  {
    key: 'ai.provider',
    label: 'Provider',
    category: 'ai-internal',
    isSecret: false,
  },
  {
    key: 'ai.embedding_dim',
    label: 'Embedding dimension (auto-detected)',
    category: 'ai-internal',
    isSecret: false,
  },
  // ── SEO ──────────────────────────────────────────────────────────────
  // Global SEO defaults. Per-route overrides live in the seo_pages table
  // (see SeoModule). All non-secret plain strings; surfaced in the admin
  // SEO panel under category "seo".
  {
    key: 'seo.site_url',
    label: 'URL situs (origin, mis. https://rumahquran.id)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.site_name',
    label: 'Nama situs (untuk og:site_name & template judul)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.default_title',
    label: 'Judul default (beranda & fallback)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.title_template',
    label: 'Template judul, gunakan %s untuk judul halaman',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.default_description',
    label: 'Meta description default',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.default_keywords',
    label: 'Keywords default (pisahkan dengan koma)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.default_og_image',
    label: 'OG image default (URL absolut atau path relatif)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.twitter_handle',
    label: 'Twitter/X handle (mis. @rumahquran)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.twitter_card',
    label: 'Twitter card type (summary / summary_large_image)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.facebook_app_id',
    label: 'Facebook App ID (fb:app_id)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.locale',
    label: 'Locale OG (mis. id_ID)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.google_site_verification',
    label: 'Google Search Console verification token',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.bing_site_verification',
    label: 'Bing Webmaster verification token',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.ga_measurement_id',
    label: 'Google Analytics 4 Measurement ID (G-XXXX)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.gtm_id',
    label: 'Google Tag Manager ID (GTM-XXXX)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.robots_indexable',
    label: 'Izinkan diindeks mesin pencari (true/false)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.robots_extra',
    label: 'Baris tambahan robots.txt (opsional, mentah)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.organization_name',
    label: 'Nama organisasi (JSON-LD Organization)',
    category: 'seo',
    isSecret: false,
  },
  {
    key: 'seo.organization_logo',
    label: 'Logo organisasi (URL, JSON-LD)',
    category: 'seo',
    isSecret: false,
  },
];

export const DEFAULTS: Record<string, string> = {
  'ai.provider': 'openai',
  'ai.embedding_model': 'text-embedding-3-small',
  'ai.embedding_dim': '1536',
  'ai.openai_api_key': '',
  'ai.openai_base_url': 'https://api.openai.com/v1',
  'ai.llm_model': 'gpt-4o-mini',
  'ai.summary_enabled': 'true',
  'ai.score_threshold': '0.3',
  'ai.budget_monthly_usd': '0',
  // SEO defaults
  'seo.site_url': 'https://rumahquran.id',
  'seo.site_name': "Rumah Qur'an",
  'seo.default_title': "Rumah Qur'an — Baca Al-Qur'an, Tafsir, Doa & Ibadah Harian",
  'seo.title_template': "%s · Rumah Qur'an",
  'seo.default_description':
    "Baca Al-Qur'an 30 juz, dengarkan murottal, tafsir Kemenag, doa & dzikir, jadwal sholat, asmaul husna, dan kisah nabi. Lengkap dengan bookmark dan hafalan.",
  'seo.default_keywords':
    "al-quran, quran online, baca quran, tafsir, doa, dzikir, jadwal sholat, murottal, asmaul husna, rumah quran",
  'seo.default_og_image': '/og-default.png',
  'seo.twitter_handle': '',
  'seo.twitter_card': 'summary_large_image',
  'seo.facebook_app_id': '',
  'seo.locale': 'id_ID',
  'seo.google_site_verification': '',
  'seo.bing_site_verification': '',
  'seo.ga_measurement_id': '',
  'seo.gtm_id': '',
  'seo.robots_indexable': 'true',
  'seo.robots_extra': '',
  'seo.organization_name': "Rumah Qur'an",
  'seo.organization_logo': '/icon-512.png',
};

const DEF_BY_KEY = new Map(SETTING_DEFS.map((d) => [d.key, d]));

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, string>();
  private cacheLoaded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private masterKey(): string {
    return this.config.get<string>('appEncryptionKey') ?? '';
  }

  /** Lazy load the entire settings table into memory. ~50 rows, fine to hold. */
  private async ensureCache(): Promise<void> {
    if (this.cacheLoaded) return;
    const rows = await this.prisma.appSetting.findMany();
    for (const r of rows) {
      this.cache.set(r.key, r.value);
    }
    this.cacheLoaded = true;
  }

  /** Read raw stored value (encrypted if secret). Falls back to DEFAULTS. */
  private async readRaw(key: string): Promise<string> {
    await this.ensureCache();
    if (this.cache.has(key)) return this.cache.get(key) as string;
    return DEFAULTS[key] ?? '';
  }

  /** Decrypted value. For non-secret keys this is the same as the stored
   * value; for secret keys the master key is required. */
  async get(key: string): Promise<string> {
    const def = DEF_BY_KEY.get(key);
    const raw = await this.readRaw(key);
    if (!def || !def.isSecret || !raw) return raw;
    return decryptString(raw, this.masterKey());
  }

  /** Batch-read several keys at once. */
  async getMany(keys: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = await this.get(k);
    return out;
  }

  /** Upsert one setting. Encrypts when the def says it is secret. */
  async set(key: string, value: string): Promise<void> {
    const def = DEF_BY_KEY.get(key);
    if (!def) {
      this.logger.warn(
        `set(): unknown setting key "${key}" — refusing to write.`,
      );
      return;
    }
    const stored = def.isSecret
      ? value
        ? encryptString(value, this.masterKey())
        : ''
      : value;
    await this.prisma.appSetting.upsert({
      where: { key },
      update: {
        value: stored,
        isSecret: def.isSecret,
        label: def.label,
        category: def.category,
      },
      create: {
        key,
        value: stored,
        isSecret: def.isSecret,
        label: def.label,
        category: def.category,
      },
    });
    this.cache.set(key, stored);
  }

  /** Public-facing form payload — secrets returned masked, never plaintext. */
  async listForAdmin(category?: string): Promise<
    {
      key: string;
      label: string;
      category: string;
      isSecret: boolean;
      isConfigured: boolean;
      preview: string;
    }[]
  > {
    const defs = category
      ? SETTING_DEFS.filter((d) => d.category === category)
      : SETTING_DEFS;
    const out: ReturnType<SettingsService['listForAdmin']> extends Promise<infer R>
      ? R
      : never = [];
    for (const d of defs) {
      const plain = await this.get(d.key);
      out.push({
        key: d.key,
        label: d.label,
        category: d.category,
        isSecret: d.isSecret,
        isConfigured: !!plain,
        preview: d.isSecret ? maskSecret(plain) : plain,
      });
    }
    return out;
  }

  /** Update a batch of settings atomically (best-effort — no nested txn). */
  async setMany(values: Record<string, string>): Promise<void> {
    for (const [k, v] of Object.entries(values)) {
      await this.set(k, v);
    }
  }

  /** Test that the AI provider config is reachable & valid. Used by the
   * admin "Test connection" button. */
  async testAiConnection(): Promise<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  }> {
    const cfg = await this.getMany([
      'ai.provider',
      'ai.openai_api_key',
      'ai.openai_base_url',
      'ai.embedding_model',
    ]);
    if (!cfg['ai.openai_api_key']) {
      return { ok: false, message: 'API key belum di-set.' };
    }
    const url = `${cfg['ai.openai_base_url'] || 'https://api.openai.com/v1'}/embeddings`;
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg['ai.openai_api_key']}`,
        },
        body: JSON.stringify({
          model: cfg['ai.embedding_model'] || 'text-embedding-3-small',
          input: 'test',
        }),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const txt = await res.text();
        return {
          ok: false,
          message: `HTTP ${res.status}: ${txt.slice(0, 200)}`,
          latencyMs,
        };
      }
      const json = (await res.json()) as {
        data?: { embedding: number[] }[];
      };
      const dim = json.data?.[0]?.embedding?.length ?? 0;
      return {
        ok: true,
        message: `Embedding OK (dim ${dim}, ${latencyMs}ms)`,
        latencyMs,
      };
    } catch (err) {
      return {
        ok: false,
        message: `Network error: ${(err as Error).message}`,
        latencyMs: Date.now() - started,
      };
    }
  }

  /** Invalidate the in-memory cache. Other instances would need a pub/sub
   * here for multi-replica setups; single-process app — direct clear. */
  invalidate(): void {
    this.cache.clear();
    this.cacheLoaded = false;
  }
}
