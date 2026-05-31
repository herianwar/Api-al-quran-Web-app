import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });
  // Behind nginx (proxy_pass 127.0.0.1:3000). Trust the loopback proxy so
  // req.ip resolves to the real client IP from X-Forwarded-For. Without this
  // the throttler buckets every visitor under 127.0.0.1 — one shared
  // 120/min limit for the whole site, causing spurious 429s on refresh.
  app.set('trust proxy', 'loopback');
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = config.get<number>('port') ?? 3000;
  const apiPrefix = config.get<string>('apiPrefix') ?? 'api/v1';
  const corsOrigin = config.get<string>('corsOrigin') ?? '*';
  const nodeEnv = config.get<string>('nodeEnv') ?? 'development';

  // Dev-mode reminder when running with .env.example defaults. Production
  // boot already aborts in configuration.ts.
  if (nodeEnv !== 'production') {
    const jwtSecret = config.get<string>('jwt.secret') ?? '';
    const seedKey = config.get<string>('seedAdminKey') ?? '';
    if (/^change-me/i.test(jwtSecret) || /^change-me/i.test(seedKey)) {
      logger.warn(
        '⚠️  Menggunakan secret default (change-me-*). OK untuk development, '
          + 'WAJIB diganti sebelum deploy ke production.',
      );
    }
  }

  // Security & performance middleware. The seed monitor is an inline-script
  // HTML page that loads the same-origin socket.io client, so CSP allows
  // 'self' + 'unsafe-inline' for that specific case. Swagger UI also relies
  // on inline scripts. crossOriginResourcePolicy stays cross-origin so the
  // monitor can be embedded by other tools during local development.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:', 'https:'],
          fontSrc: ["'self'", 'data:', 'https:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          upgradeInsecureRequests: nodeEnv === 'production' ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Global prefix; health check stays at root /health.
  app.setGlobalPrefix(apiPrefix, { exclude: ['health'] });

  // X-API-Version header on every response so clients can detect
  // breaking changes. Mirrors the segment in the URL prefix (api/v1 → v1).
  const apiVersion = apiPrefix.split('/').pop() ?? 'v1';
  app.use((_req: unknown, res: { setHeader: (n: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-API-Version', apiVersion);
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Serve the standalone seed monitor (and any other static asset).
  app.useStaticAssets(join(__dirname, '..', 'public'));
  // Serve user-uploaded shop images at /uploads/* — mounted with a long
  // immutable cache header because filenames are hashed / time-stamped.
  app.useStaticAssets(join(__dirname, '..', 'data', 'uploads'), {
    prefix: '/uploads/',
    maxAge: 86_400_000 * 30, // 30 days
    immutable: true,
  });

  // Swagger docs at /api/docs (interactive) + /api/docs-json (raw OpenAPI).
  // Tag descriptions are added to the document so they appear above each
  // group of endpoints in the Swagger UI sidebar — way nicer than just
  // bare slugs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Al-Quran Super App API')
    .setDescription(
      [
        'API mandiri Al-Quran self-hosted. Konten Quran, tafsir multi-sumber,',
        'terjemahan, doa, jadwal sholat, audio proxy, plus fitur user (bookmark,',
        'hafalan spaced-repetition), admin panel, dan integrasi push notification.',
        '',
        '**Auth schemes:**',
        '- `bearer` — JWT access token dari `/auth/login`. Dipakai untuk endpoint user + admin role.',
        '- `admin-key` — header `x-seed-admin-key` dari env. Untuk skrip/CI.',
        '- Endpoint seed/snapshot/api-keys menerima **salah satu**: JWT admin atau seed key.',
        '',
        '**Konvensi response:** `{ success, message, data, meta? }` (skema `ApiSuccess`). Error: `{ success:false, message, error?, statusCode }` (skema `ApiError`). Pengecualian: `GET /quran/dump` (JSON mentah) & endpoint `…/export` (text/csv).',
        '',
        '**Pagination:** query `?page=1&limit=20`. Response meta: `{ total, page, limit, totalPages, hasMore }`.',
        '',
        '**Delta sync:** banyak list endpoint terima `?since=ISO8601` — server return rows dengan `updatedAt > since`.',
        '',
        '**ETag caching:** endpoint konten kembalikan `ETag` + `Cache-Control`. Pakai `If-None-Match` → server balas 304.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .setContact(
      'Al-Quran Super App',
      'https://github.com/herianwar/Api-al-quran-Web-app',
      '',
    )
    .setLicense('UNLICENSED', '');

  // Register the public production URL FIRST (when known) so Swagger UI's
  // "Try It Out" hits the live API by default — previously only localhost
  // was registered, so production users got CORS/network errors when trying
  // endpoints from the docs. Falls back to the first CORS_ORIGIN entry when
  // PUBLIC_URL isn't set.
  const firstCorsOrigin = corsOrigin
    .split(',')
    .map((s) => s.trim())
    .find((s) => /^https?:\/\//.test(s));
  const swaggerPublicUrl =
    process.env.PUBLIC_URL ??
    (nodeEnv === 'production' ? firstCorsOrigin : undefined);
  if (swaggerPublicUrl) {
    swaggerConfig.addServer(swaggerPublicUrl, 'Production');
  }
  swaggerConfig.addServer(`http://localhost:${port}`, 'Local dev');

  const builtSwaggerConfig = swaggerConfig
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addApiKey(
      { type: 'apiKey', name: 'x-seed-admin-key', in: 'header' },
      'admin-key',
    )
    .addApiKey(
      { type: 'apiKey', name: 'X-API-Key', in: 'header' },
      'api-key',
    )
    // Tag descriptions — order matters for the sidebar grouping
    .addTag('Quran', 'Surat, ayat, juz, halaman, search ayat, full dump')
    .addTag('Audio', 'Daftar qari + URL audio + streaming proxy lokal')
    .addTag('Adzan', 'Audio adzan self-hosted (daftar + streaming proxy lokal)')
    .addTag('Tafsir', 'Tafsir multi-sumber (Kemenag, Ibn Kathir, Muyassar)')
    .addTag('Translation', 'Terjemahan multi-bahasa (Indonesia, English)')
    .addTag('Asbabun Nuzul', 'Konteks turunnya ayat')
    .addTag('Asmaul Husna', '99 Nama Allah dengan arab, latin & arti')
    .addTag('Topic / Tematik', 'Browse ayat per tema (sabar, syukur, doa, dll)')
    .addTag('Doa', 'Koleksi doa & dzikir harian')
    .addTag('Hadis', 'Hadis 9 perawi (Bukhari, Muslim, Abu Dawud, dst.) — Indonesian')
    .addTag('Jadwal Sholat', 'Waktu sholat per kota per hari')
    .addTag('Auth', 'Register, login, refresh, logout (JWT)')
    .addTag('User', 'Profil, bookmark, hafalan + spaced-rep, device tokens')
    .addTag('Admin (role)', 'Endpoint yang butuh JWT + role=admin')
    .addTag('Admin Content', 'CRUD doa & topik')
    .addTag(
      'Cron / Notifications (Admin)',
      'Schedule + manual trigger + broadcast push',
    )
    .addTag('Seed (Admin)', 'Re-seed konten + snapshot pg_dump')
    .addTag('API Keys (Admin)', 'Manage X-API-Key untuk client apps')
    .addTag(
      'Shop',
      'Public shop catalog (kategori, produk, banner, settings) + order via form/WA',
    )
    .addTag(
      'Shop Admin',
      'CRUD produk/kategori/banner/setting + upload gambar, form builder & laporan order',
    )
    .addTag(
      'Artikel',
      'Portal artikel publik: daftar + detail (HTML) + kategori + artikel terkait',
    )
    .addTag(
      'Artikel Admin',
      'CRUD artikel & kategori + upload gambar (cover/inline editor)',
    )
    .build();
  const document = SwaggerModule.createDocument(app, builtSwaggerConfig);

  // ── Document the real response shapes on every operation ───────────────
  // NestJS-Swagger doesn't infer response bodies, so previously 0/233 ops
  // documented what they return. In reality TransformInterceptor wraps every
  // JSON response as { success, message, data, meta? } and AllExceptionsFilter
  // emits { success:false, message, error, statusCode }. Inject those schemas
  // so both /api/docs and /admin/api-docs reflect reality.
  enrichResponseSchemas(document);

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Al-Quran API · Docs',
    customCss: `
      .topbar { display: none; }
      .swagger-ui .info { margin: 1.5rem 0; }
      .swagger-ui .info .title { color: #047857; font-weight: 700; }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #0ea5e9; }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #10b981; }
      .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #f59e0b; }
      .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #ef4444; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
      displayRequestDuration: true,
      tryItOutEnabled: true,
    },
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Server berjalan di http://localhost:${port}`);
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  logger.log(
    `🌱 Seed monitor: http://localhost:${port}/seed-monitor.html`,
  );
}

/**
 * Add the standard success/error envelope schemas to the OpenAPI document and
 * attach them to every operation's responses — accurately, matching what the
 * server actually returns at runtime:
 *   • Normal JSON endpoints → ApiSuccess `{ success, message, data, meta? }`.
 *   • GET /quran/dump → raw JSON (NOT wrapped — passes through TransformInterceptor).
 *   • …/export → text/csv attachment (NOT JSON).
 *   • Errors → ApiError `{ success:false, message, error?, statusCode }`, only
 *     for the codes that can genuinely occur on a given operation.
 */
function enrichResponseSchemas(document: OpenAPIObject): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const components = (document.components ??= {});
  const schemas = ((components as any).schemas ??= {}) as Record<string, any>;

  schemas.ApiMeta = {
    type: 'object',
    description: 'Metadata pagination (hanya pada endpoint list).',
    properties: {
      total: { type: 'integer', example: 114 },
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 20 },
      totalPages: { type: 'integer', example: 6 },
      hasMore: { type: 'boolean', example: true },
    },
  };
  schemas.ApiSuccess = {
    type: 'object',
    required: ['success', 'message', 'data'],
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'OK' },
      data: {
        description: 'Payload spesifik endpoint (objek, array, atau null).',
        nullable: true,
      },
      meta: {
        allOf: [{ $ref: '#/components/schemas/ApiMeta' }],
        nullable: true,
      },
    },
  };
  schemas.ApiError = {
    type: 'object',
    required: ['success', 'message', 'statusCode'],
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Data tidak ditemukan' },
      error: { type: 'string', example: 'NOT_FOUND' },
      statusCode: { type: 'integer', example: 404 },
    },
  };

  const okJson = {
    'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } },
  };
  const errJson = {
    'application/json': { schema: { $ref: '#/components/schemas/ApiError' } },
  };
  const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

  for (const [routePath, pathItem] of Object.entries(document.paths)) {
    const isRawDump = /\/quran\/dump$/.test(routePath);
    const isCsv = /\/export$/.test(routePath);
    const underAdmin = /\/admin\//.test(routePath);
    const hasPathParam = /\{[^}]+\}/.test(routePath);

    for (const method of METHODS) {
      const op = (pathItem as Record<string, any>)[method];
      if (!op || typeof op !== 'object') continue;
      const responses = (op.responses ??= {});

      // Reuse the success code NestJS already generated (respects @HttpCode).
      const okCode =
        Object.keys(responses).find((c) => /^2\d\d$/.test(c)) ??
        (method === 'post' ? '201' : '200');
      const prevDesc: string | undefined = responses[okCode]?.description;

      if (isCsv) {
        responses[okCode] = {
          description: prevDesc || 'File CSV (text/csv) — bukan envelope JSON.',
          content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
        };
      } else if (isRawDump) {
        responses[okCode] = {
          description:
            prevDesc || 'Dump JSON penuh untuk cache offline (tanpa envelope).',
          content: { 'application/json': { schema: { type: 'object' } } },
        };
      } else {
        // Preserve a richer success schema the controller already declared via
        // @ApiOkResponse (e.g. ApiSuccess + data:AyatEntity). Only fall back to
        // the bare ApiSuccess envelope when no JSON schema was set.
        const existingSchema = (responses[okCode] as any)?.content?.[
          'application/json'
        ]?.schema;
        responses[okCode] = {
          description: prevDesc && prevDesc.length ? prevDesc : 'Sukses',
          content: existingSchema
            ? { 'application/json': { schema: existingSchema } }
            : okJson,
        };
      }

      // Only attach error codes that can actually happen on this operation.
      const secured = Array.isArray(op.security) && op.security.length > 0;
      const hasInput =
        !!op.requestBody ||
        (Array.isArray(op.parameters) && op.parameters.length > 0);
      const addErr = (code: string, description: string) => {
        if (!responses[code]) responses[code] = { description, content: errJson };
      };
      if (hasInput) addErr('400', 'Permintaan tidak valid (validasi gagal).');
      if (secured) addErr('401', 'Token tidak ada / tidak valid.');
      if (underAdmin) addErr('403', 'Akses ditolak (butuh role admin).');
      if (hasPathParam) addErr('404', 'Data tidak ditemukan.');
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

void bootstrap();
