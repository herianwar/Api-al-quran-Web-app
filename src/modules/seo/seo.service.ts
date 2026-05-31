import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  ResolvedMeta,
  RobotsPolicy,
  RouteTemplate,
  SeoGlobals,
  SitemapEntry,
} from './seo.types';

/** Curated metadata for the static (non-dynamic) public routes. The key is
 * the exact pathname. `title` is the page title BEFORE the title template is
 * applied. */
const STATIC_ROUTES: Record<
  string,
  { title: string; description: string; priority?: number; changefreq?: string }
> = {
  '/doa': {
    title: 'Doa & Dzikir Harian',
    description:
      'Kumpulan doa dan dzikir harian lengkap dengan tulisan Arab, latin, terjemahan, dan sumbernya.',
    priority: 0.8,
  },
  '/hadis': {
    title: 'Kumpulan Hadis',
    description:
      'Baca hadis dari berbagai perawi: Bukhari, Muslim, dan lainnya — lengkap dengan teks Arab dan terjemahan.',
    priority: 0.8,
  },
  '/hadis-qudsi': {
    title: 'Hadis Qudsi',
    description:
      'Kumpulan Hadis Qudsi pilihan dengan teks Arab, terjemahan Indonesia, dan sumber riwayat.',
    priority: 0.7,
  },
  '/asmaul-husna': {
    title: 'Asmaul Husna — 99 Nama Allah',
    description:
      '99 Asmaul Husna lengkap dengan tulisan Arab, latin, arti, penjelasan, dalil, dan faidahnya.',
    priority: 0.8,
  },
  '/nabi': {
    title: 'Kisah 25 Nabi & Rasul',
    description:
      'Kisah 25 nabi dan rasul dalam Islam dari Nabi Adam hingga Nabi Muhammad ﷺ secara lengkap.',
    priority: 0.7,
  },
  '/sirah': {
    title: 'Sirah Nabawiyah',
    description:
      'Perjalanan hidup Nabi Muhammad ﷺ dari kelahiran hingga wafat dalam rangkaian sirah nabawiyah.',
    priority: 0.7,
  },
  '/khutbah': {
    title: 'Kumpulan Khutbah Jumat',
    description:
      'Materi khutbah Jumat siap pakai dengan tema beragam, lengkap dengan pembuka dan penutup.',
    priority: 0.6,
  },
  '/topic': {
    title: 'Topik Al-Qur’an',
    description:
      'Jelajahi ayat Al-Qur’an berdasarkan topik dan tema untuk memudahkan tadabbur dan kajian.',
    priority: 0.6,
  },
  '/tahlil': {
    title: 'Bacaan Tahlil',
    description:
      'Susunan bacaan tahlil lengkap dengan tulisan Arab, latin, dan terjemahan Indonesia.',
    priority: 0.6,
  },
  '/wirid': {
    title: 'Wirid & Dzikir Pagi Petang',
    description:
      'Wirid dan dzikir pagi-petang lengkap beserta jumlah hitungan, tulisan Arab, latin, dan artinya.',
    priority: 0.6,
  },
  '/sajdah': {
    title: 'Ayat-Ayat Sajdah',
    description:
      'Daftar ayat sajdah dalam Al-Qur’an beserta lokasi surat dan ayatnya untuk sujud tilawah.',
    priority: 0.5,
  },
  '/sholat': {
    title: 'Jadwal Sholat',
    description:
      'Jadwal waktu sholat harian akurat untuk kota-kota di Indonesia: Subuh, Dzuhur, Ashar, Maghrib, Isya.',
    priority: 0.8,
  },
  '/adzan': {
    title: 'Audio Adzan',
    description:
      'Koleksi audio adzan (panggilan shalat) yang bisa diputar langsung, di-host sendiri dengan kualitas konsisten.',
    priority: 0.6,
  },
  '/shalat/niat': {
    title: 'Niat Shalat',
    description:
      'Kumpulan niat shalat fardhu dan sunnah lengkap dengan tulisan Arab, latin, dan terjemahan.',
    priority: 0.6,
  },
  '/shalat/bacaan': {
    title: 'Bacaan Shalat',
    description:
      'Bacaan shalat dari takbir hingga salam lengkap dengan tulisan Arab, latin, dan artinya.',
    priority: 0.6,
  },
  '/hijri': {
    title: 'Kalender Hijriah',
    description:
      'Konversi dan kalender Hijriah-Masehi beserta penanggalan hari ini menurut kalender Islam.',
    priority: 0.5,
  },
  '/qibla': {
    title: 'Arah Kiblat',
    description:
      'Tentukan arah kiblat dari lokasi Anda menuju Ka’bah di Makkah dengan kompas digital.',
    priority: 0.5,
  },
  '/quiz': {
    title: 'Kuis Hafalan Al-Qur’an',
    description:
      'Uji hafalan Al-Qur’an dengan kuis sambung ayat dan isi kata yang seru dan menantang.',
    priority: 0.5,
  },
  '/tanya': {
    title: 'Tanya Al-Qur’an',
    description:
      'Cari jawaban dari Al-Qur’an dengan pencarian cerdas berbasis makna ayat dan terjemahan.',
    priority: 0.6,
  },
  '/toko': {
    title: 'Toko',
    description:
      'Mushaf, buku islami, dan perlengkapan ibadah pilihan. Belanja mudah langsung via WhatsApp.',
    priority: 0.7,
  },
  '/artikel': {
    title: 'Artikel',
    description:
      'Portal artikel Rumah Qur’an: kajian, kisah inspiratif, dan panduan ibadah harian yang ringan dibaca.',
    priority: 0.8,
    changefreq: 'daily',
  },
};

/** Paths that should never be indexed (auth-walled / private). */
const NOINDEX_PREFIXES = ['/me', '/login', '/register', '/admin'];

@Injectable()
export class SeoService {
  private readonly logger = new Logger(SeoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ── Globals ────────────────────────────────────────────────────────────

  async getGlobals(): Promise<SeoGlobals> {
    const s = await this.settings.getMany([
      'seo.site_url',
      'seo.site_name',
      'seo.default_title',
      'seo.title_template',
      'seo.default_description',
      'seo.default_keywords',
      'seo.default_og_image',
      'seo.twitter_handle',
      'seo.twitter_card',
      'seo.facebook_app_id',
      'seo.locale',
      'seo.google_site_verification',
      'seo.bing_site_verification',
      'seo.ga_measurement_id',
      'seo.gtm_id',
      'seo.robots_indexable',
      'seo.robots_extra',
      'seo.organization_name',
      'seo.organization_logo',
    ]);
    return {
      siteUrl: stripTrailingSlash(s['seo.site_url'] || 'https://rumahquran.id'),
      siteName: s['seo.site_name'] || "Rumah Qur'an",
      defaultTitle:
        s['seo.default_title'] ||
        "Rumah Qur'an — Baca Al-Qur'an, Tafsir, Doa & Ibadah Harian",
      titleTemplate: s['seo.title_template'] || "%s · Rumah Qur'an",
      defaultDescription: s['seo.default_description'] || '',
      defaultKeywords: s['seo.default_keywords'] || '',
      defaultOgImage: s['seo.default_og_image'] || '/og-default.png',
      twitterHandle: s['seo.twitter_handle'] || '',
      twitterCard: s['seo.twitter_card'] || 'summary_large_image',
      facebookAppId: s['seo.facebook_app_id'] || '',
      locale: s['seo.locale'] || 'id_ID',
      googleSiteVerification: s['seo.google_site_verification'] || '',
      bingSiteVerification: s['seo.bing_site_verification'] || '',
      gaMeasurementId: s['seo.ga_measurement_id'] || '',
      gtmId: s['seo.gtm_id'] || '',
      indexable: (s['seo.robots_indexable'] || 'true') !== 'false',
      robotsExtra: s['seo.robots_extra'] || '',
      organizationName: s['seo.organization_name'] || "Rumah Qur'an",
      organizationLogo: s['seo.organization_logo'] || '/icon-512.png',
    };
  }

  // ── Resolve a single route ───────────────────────────────────────────────

  async resolve(rawPath: string): Promise<ResolvedMeta> {
    const path = normalizePath(rawPath);
    const globals = await this.getGlobals();
    const template = await this.buildTemplate(path, globals);
    const override = await this.findOverride(path);

    let source: ResolvedMeta['source'] = template.isFallback
      ? 'default'
      : 'template';
    if (override) source = 'override';

    // Page title (before template) — override wins, else template, else "".
    const pageTitle = override?.title || template.title || '';
    const isHome = template.isHome === true;
    const title = isHome
      ? pageTitle || globals.defaultTitle
      : pageTitle
        ? applyTemplate(pageTitle, globals.titleTemplate)
        : globals.defaultTitle;

    const description =
      override?.description ||
      template.description ||
      globals.defaultDescription;

    const keywords = override?.keywords || globals.defaultKeywords;

    const ogImage = toAbsolute(
      override?.ogImage || template.ogImage || globals.defaultOgImage,
      globals.siteUrl,
    );

    const ogType = override?.ogType || template.ogType || 'website';

    const canonical =
      override?.canonical || `${globals.siteUrl}${path === '/' ? '' : path}`;

    const noindex =
      !globals.indexable ||
      override?.noindex === true ||
      NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

    let jsonLd: Record<string, unknown>[] | null = null;
    if (override?.jsonLd) {
      jsonLd = parseJsonLd(override.jsonLd);
    } else if (template.jsonLd && template.jsonLd.length) {
      jsonLd = template.jsonLd;
    }

    return {
      path,
      title,
      description,
      keywords,
      canonical,
      ogTitle: title,
      ogDescription: description,
      ogImage,
      ogType,
      siteName: globals.siteName,
      locale: globals.locale,
      twitterCard: globals.twitterCard,
      twitterHandle: globals.twitterHandle,
      facebookAppId: globals.facebookAppId,
      noindex,
      jsonLd,
      source,
    };
  }

  private async findOverride(path: string) {
    try {
      const row = await this.prisma.seoPage.findUnique({ where: { path } });
      return row && row.isActive ? row : null;
    } catch (err) {
      this.logger.warn(`findOverride(${path}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ── Per-route content-derived templates ──────────────────────────────────

  private async buildTemplate(
    path: string,
    globals: SeoGlobals,
  ): Promise<RouteTemplate> {
    if (path === '/') {
      return {
        title: globals.defaultTitle,
        description: globals.defaultDescription,
        isHome: true,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: globals.siteName,
            url: globals.siteUrl,
            potentialAction: {
              '@type': 'SearchAction',
              target: `${globals.siteUrl}/tanya?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: globals.organizationName,
            url: globals.siteUrl,
            logo: toAbsolute(globals.organizationLogo, globals.siteUrl),
          },
        ],
      };
    }

    if (STATIC_ROUTES[path]) {
      return {
        title: STATIC_ROUTES[path].title,
        description: STATIC_ROUTES[path].description,
      };
    }

    const seg = path.split('/').filter(Boolean);

    try {
      // /surat/{nomor}
      if (seg[0] === 'surat' && seg[1] && /^\d+$/.test(seg[1])) {
        const surah = await this.prisma.surah.findUnique({
          where: { nomor: Number(seg[1]) },
        });
        if (surah) {
          const title = `Surat ${surah.namaLatin} (${surah.arti})`;
          return {
            title,
            description: clip(
              `Baca Surat ${surah.namaLatin} (${surah.nama}) — surat ke-${surah.nomor}, ${surah.jumlahAyat} ayat, ${surah.tempatTurun}. Lengkap dengan terjemahan, tafsir, dan murottal. ${stripHtml(surah.deskripsi)}`,
            ),
            ogType: 'article',
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'Article',
                headline: title,
                inLanguage: 'id',
                isPartOf: { '@type': 'WebSite', name: globals.siteName },
              },
            ],
          };
        }
      }

      // /asmaul-husna/{id}
      if (seg[0] === 'asmaul-husna' && seg[1] && /^\d+$/.test(seg[1])) {
        const n = await this.prisma.asmaulHusna.findUnique({
          where: { id: Number(seg[1]) },
        });
        if (n) {
          return {
            title: `${n.latin} (${n.arti}) — Asmaul Husna`,
            description: clip(
              n.penjelasan ||
                `${n.latin} (${n.arab}) artinya ${n.arti}. Salah satu dari 99 Asmaul Husna, nama-nama indah Allah.`,
            ),
            ogType: 'article',
          };
        }
      }

      // /nabi/{slug}
      if (seg[0] === 'nabi' && seg[1]) {
        const nabi = await this.prisma.nabi.findUnique({
          where: { slug: seg[1] },
        });
        if (nabi) {
          return {
            title: `Kisah Nabi ${nabi.nama}${nabi.gelar ? ` ${nabi.gelar}` : ''}`,
            description: clip(nabi.ringkasan),
            ogType: 'article',
          };
        }
      }

      // /sirah/{slug}
      if (seg[0] === 'sirah' && seg[1]) {
        const s = await this.prisma.sirah.findUnique({
          where: { slug: seg[1] },
        });
        if (s) {
          return {
            title: `${s.judul} — Sirah Nabawiyah`,
            description: clip(stripHtml(s.isi)),
            ogType: 'article',
          };
        }
      }

      // /khutbah/{slug}
      if (seg[0] === 'khutbah' && seg[1]) {
        const k = await this.prisma.khutbah.findUnique({
          where: { slug: seg[1] },
        });
        if (k) {
          return {
            title: `Khutbah: ${k.judul}`,
            description: clip(k.tema || stripHtml(k.isi)),
            ogType: 'article',
          };
        }
      }

      // /topic/{slug}
      if (seg[0] === 'topic' && seg[1]) {
        const t = await this.prisma.topic.findUnique({
          where: { slug: seg[1] },
        });
        if (t) {
          return {
            title: `${t.nama} — Topik Al-Qur’an`,
            description: clip(t.deskripsi || t.aiSummary || `Ayat-ayat Al-Qur’an tentang ${t.nama}.`),
            ogType: 'article',
          };
        }
      }

      // /toko/{slug}
      if (seg[0] === 'toko' && seg[1]) {
        const p = await this.prisma.shopProduct.findUnique({
          where: { slug: seg[1] },
          include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
        });
        if (p) {
          return {
            title: p.nama,
            description: clip(p.deskripsi),
            ogType: 'product',
            ogImage: p.images?.[0]?.url,
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'Product',
                name: p.nama,
                description: clip(p.deskripsi),
                offers: {
                  '@type': 'Offer',
                  price: p.hargaIdr,
                  priceCurrency: 'IDR',
                  availability:
                    p.stok === null || p.stok > 0
                      ? 'https://schema.org/InStock'
                      : 'https://schema.org/OutOfStock',
                },
              },
            ],
          };
        }
      }

      // /artikel/{slug}
      if (seg[0] === 'artikel' && seg[1]) {
        const a = await this.prisma.artikel.findFirst({
          where: { slug: seg[1], status: 'published' },
          include: { category: { select: { nama: true } } },
        });
        if (a) {
          return {
            title: a.judul,
            description: clip(a.ringkasan || stripHtml(a.konten)),
            ogType: 'article',
            ogImage: a.coverUrl || undefined,
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'Article',
                headline: a.judul,
                description: clip(a.ringkasan || stripHtml(a.konten)),
                inLanguage: 'id',
                image: a.coverUrl ? toAbsolute(a.coverUrl, globals.siteUrl) : undefined,
                author: a.penulis
                  ? { '@type': 'Person', name: a.penulis }
                  : { '@type': 'Organization', name: globals.organizationName },
                datePublished: (a.publishedAt ?? a.createdAt).toISOString(),
                dateModified: a.updatedAt.toISOString(),
                articleSection: a.category?.nama,
                isPartOf: { '@type': 'WebSite', name: globals.siteName },
              },
            ],
          };
        }
      }

      // /hadis/{perawi}/{nomor}
      if (seg[0] === 'hadis' && seg[1] && seg[2] && /^\d+$/.test(seg[2])) {
        const perawi = await this.prisma.perawi.findUnique({
          where: { slug: seg[1] },
        });
        const hadis = await this.prisma.hadis
          .findUnique({
            where: { perawiSlug_nomor: { perawiSlug: seg[1], nomor: Number(seg[2]) } },
          })
          .catch(() => null);
        if (perawi) {
          return {
            title: `Hadis ${perawi.nama} No. ${seg[2]}`,
            description: hadis
              ? clip(stripHtml((hadis as { terjemah?: string }).terjemah || ''))
              : `Hadis riwayat ${perawi.nama} nomor ${seg[2]} lengkap dengan teks Arab dan terjemahan Indonesia.`,
            ogType: 'article',
          };
        }
      }

      // /hadis/{perawi}
      if (seg[0] === 'hadis' && seg[1] && !seg[2]) {
        const perawi = await this.prisma.perawi.findUnique({
          where: { slug: seg[1] },
        });
        if (perawi) {
          return {
            title: `Hadis ${perawi.nama}`,
            description: `Kumpulan hadis riwayat ${perawi.nama} (${perawi.total} hadis) lengkap dengan teks Arab dan terjemahan Indonesia.`,
          };
        }
      }
    } catch (err) {
      this.logger.warn(`buildTemplate(${path}) failed: ${(err as Error).message}`);
    }

    return { isFallback: true };
  }

  // ── Sitemap ──────────────────────────────────────────────────────────────

  async buildSitemap(): Promise<SitemapEntry[]> {
    const entries: SitemapEntry[] = [{ path: '/', changefreq: 'daily', priority: 1 }];

    for (const [path, meta] of Object.entries(STATIC_ROUTES)) {
      entries.push({
        path,
        changefreq: meta.changefreq || 'weekly',
        priority: meta.priority ?? 0.6,
      });
    }

    try {
      // Surahs 1..114
      const surahs = await this.prisma.surah.findMany({
        select: { nomor: true },
        orderBy: { nomor: 'asc' },
      });
      for (const s of surahs) {
        entries.push({ path: `/surat/${s.nomor}`, changefreq: 'monthly', priority: 0.7 });
      }

      const asma = await this.prisma.asmaulHusna.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      for (const a of asma) {
        entries.push({ path: `/asmaul-husna/${a.id}`, changefreq: 'yearly', priority: 0.5 });
      }

      const nabi = await this.prisma.nabi.findMany({ select: { slug: true } });
      for (const n of nabi) entries.push({ path: `/nabi/${n.slug}`, priority: 0.6 });

      const sirah = await this.prisma.sirah.findMany({ select: { slug: true } });
      for (const s of sirah) entries.push({ path: `/sirah/${s.slug}`, priority: 0.6 });

      const khutbah = await this.prisma.khutbah.findMany({ select: { slug: true } });
      for (const k of khutbah) entries.push({ path: `/khutbah/${k.slug}`, priority: 0.5 });

      const topics = await this.prisma.topic.findMany({ select: { slug: true } });
      for (const t of topics) entries.push({ path: `/topic/${t.slug}`, priority: 0.5 });

      const perawi = await this.prisma.perawi.findMany({ select: { slug: true } });
      for (const p of perawi) entries.push({ path: `/hadis/${p.slug}`, priority: 0.6 });

      const products = await this.prisma.shopProduct.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      });
      for (const p of products) {
        entries.push({
          path: `/toko/${p.slug}`,
          lastModified: p.updatedAt.toISOString(),
          priority: 0.6,
        });
      }

      const artikel = await this.prisma.artikel.findMany({
        where: { status: 'published' },
        select: { slug: true, updatedAt: true },
      });
      for (const a of artikel) {
        entries.push({
          path: `/artikel/${a.slug}`,
          lastModified: a.updatedAt.toISOString(),
          changefreq: 'weekly',
          priority: 0.7,
        });
      }
    } catch (err) {
      this.logger.warn(`buildSitemap dynamic entries failed: ${(err as Error).message}`);
    }

    // Merge per-path overrides: drop noindex, apply changefreq/priority.
    let overrides: Awaited<ReturnType<SeoService['allOverrides']>> = [];
    try {
      overrides = await this.allOverrides();
    } catch {
      overrides = [];
    }
    const ovByPath = new Map(overrides.map((o) => [o.path, o]));

    const result: SitemapEntry[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      if (seen.has(e.path)) continue;
      seen.add(e.path);
      const ov = ovByPath.get(e.path);
      if (ov?.noindex) continue;
      result.push({
        path: e.path,
        lastModified: e.lastModified,
        changefreq: ov?.changefreq || e.changefreq,
        priority: ov?.priority ?? e.priority,
      });
    }
    // Include override-only paths that aren't auto-generated.
    for (const ov of overrides) {
      if (ov.noindex || seen.has(ov.path)) continue;
      if (NOINDEX_PREFIXES.some((p) => ov.path === p || ov.path.startsWith(`${p}/`)))
        continue;
      result.push({
        path: ov.path,
        changefreq: ov.changefreq || undefined,
        priority: ov.priority ?? undefined,
      });
    }
    return result;
  }

  private allOverrides() {
    return this.prisma.seoPage.findMany({
      where: { isActive: true },
      select: { path: true, noindex: true, changefreq: true, priority: true },
    });
  }

  // ── Robots ───────────────────────────────────────────────────────────────

  async buildRobots(): Promise<RobotsPolicy> {
    const g = await this.getGlobals();
    return {
      indexable: g.indexable,
      disallow: ['/admin', '/me', '/login', '/register', '/api'],
      sitemap: `${g.siteUrl}/sitemap.xml`,
      host: g.siteUrl,
      extra: g.robotsExtra,
    };
  }

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  listPages() {
    return this.prisma.seoPage.findMany({ orderBy: { path: 'asc' } });
  }

  getPage(id: number) {
    return this.prisma.seoPage.findUnique({ where: { id } });
  }

  upsertPage(data: {
    path: string;
    label?: string;
    title?: string;
    description?: string;
    keywords?: string;
    ogImage?: string;
    ogType?: string;
    canonical?: string;
    noindex?: boolean;
    changefreq?: string;
    priority?: number;
    jsonLd?: string;
    isActive?: boolean;
  }) {
    const path = normalizePath(data.path);
    const { path: _p, ...rest } = data;
    return this.prisma.seoPage.upsert({
      where: { path },
      update: { ...rest },
      create: { path, ...rest },
    });
  }

  deletePage(id: number) {
    return this.prisma.seoPage.delete({ where: { id } });
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function normalizePath(p: string): string {
  if (!p) return '/';
  let path = p.trim().split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function applyTemplate(title: string, template: string): string {
  if (!template || !template.includes('%s')) return title;
  return template.replace('%s', title);
}

function toAbsolute(url: string, siteUrl: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]*>/g, ' ');
}

function clip(text: string, max = 160): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function parseJsonLd(raw: string): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (parsed && typeof parsed === 'object')
      return [parsed as Record<string, unknown>];
    return null;
  } catch {
    return null;
  }
}
