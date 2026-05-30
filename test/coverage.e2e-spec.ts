import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * Broad coverage e2e: public content reads across every content module, the
 * SEO feature (public resolve/sitemap/robots + admin CRUD), settings, auth
 * role enforcement, and Prisma error-mapping. Runs against an isolated test
 * DB (DATABASE_URL must point to quran_test_db). Several modules auto-seed on
 * init, so content read endpoints return populated arrays.
 */
describe('Coverage (e2e)', () => {
  let app: INestApplication;
  let http: () => ReturnType<typeof request>;
  let prisma: PrismaClient;

  let adminToken = '';
  let userToken = '';
  const stamp = Date.now();
  const adminEmail = `e2e_admin_${stamp}@example.com`;
  const userEmail = `e2e_user_${stamp}@example.com`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    http = () => request(app.getHttpServer());
    prisma = new PrismaClient();

    // Admin: register → promote in DB → re-login so the JWT carries role=admin.
    await http()
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password, nama: 'E2E Admin' });
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: 'admin' },
    });
    const adminLogin = await http()
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password });
    adminToken = adminLogin.body.data.accessToken;

    // Regular user for negative role-enforcement checks.
    const userReg = await http()
      .post('/api/v1/auth/register')
      .send({ email: userEmail, password, nama: 'E2E User' });
    userToken = userReg.body.data.accessToken;
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  // ── Public content reads ──────────────────────────────────────────────
  describe('Public content reads (200 + standard envelope)', () => {
    const endpoints = [
      '/api/v1/asmaul-husna',
      '/api/v1/bacaan-shalat',
      '/api/v1/doa',
      '/api/v1/hadis-qudsi',
      '/api/v1/hadith/perawi',
      '/api/v1/khutbah',
      '/api/v1/khutbah/tema',
      '/api/v1/nabi',
      '/api/v1/niat-shalat',
      '/api/v1/sirah',
      '/api/v1/tahlil',
      '/api/v1/topic',
      '/api/v1/shop/products',
      '/api/v1/shop/categories',
      '/api/v1/shop/settings',
      '/api/v1/sholat/kota',
      '/api/v1/sholat/provinsi',
      '/api/v1/audio/qari',
      '/api/v1/quran/surat',
      '/api/v1/quran/sajdah',
      '/api/v1/tafsir/list',
      '/api/v1/translation/list',
      '/api/v1/hijri/today',
      '/api/v1/hijri/months',
    ];
    it.each(endpoints)('GET %s → 200 success', async (path) => {
      const res = await http().get(path);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── SEO public endpoints ──────────────────────────────────────────────
  describe('SEO public', () => {
    it('GET /seo/globals exposes site config', async () => {
      const res = await http().get('/api/v1/seo/globals').expect(200);
      expect(res.body.data.siteUrl).toContain('http');
      expect(res.body.data.titleTemplate).toContain('%s');
      expect(typeof res.body.data.indexable).toBe('boolean');
    });

    it('GET /seo/resolve?path=/ returns homepage metadata', async () => {
      const res = await http()
        .get('/api/v1/seo/resolve?path=/')
        .expect(200);
      expect(res.body.data.title).toBeTruthy();
      expect(res.body.data.canonical).toContain('http');
      expect(Array.isArray(res.body.data.jsonLd)).toBe(true);
    });

    it('GET /seo/resolve for a content route applies the title template', async () => {
      const res = await http()
        .get('/api/v1/seo/resolve?path=/doa')
        .expect(200);
      expect(res.body.data.title).toContain('Doa');
      expect(res.body.data.canonical).toMatch(/\/doa$/);
      expect(res.body.data.noindex).toBe(false);
    });

    it('GET /seo/sitemap returns entries including the homepage', async () => {
      const res = await http().get('/api/v1/seo/sitemap').expect(200);
      const paths = res.body.data.map((e: { path: string }) => e.path);
      expect(paths).toContain('/');
      expect(paths).toContain('/doa');
    });

    it('GET /seo/robots returns a policy', async () => {
      const res = await http().get('/api/v1/seo/robots').expect(200);
      expect(res.body.data.sitemap).toContain('/sitemap.xml');
      expect(res.body.data.disallow).toEqual(
        expect.arrayContaining(['/admin']),
      );
    });
  });

  // ── SEO admin CRUD + role enforcement ─────────────────────────────────
  describe('SEO admin', () => {
    let createdId: number;

    it('rejects /admin/seo/pages without a token (401)', async () => {
      await http().get('/api/v1/admin/seo/pages').expect(401);
    });

    it('rejects /admin/seo/pages for a non-admin user (403)', async () => {
      await http()
        .get('/api/v1/admin/seo/pages')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('admin can create an override (upsert)', async () => {
      const res = await http()
        .post('/api/v1/admin/seo/pages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ path: '/doa', title: 'Doa Pilihan E2E', noindex: false });
      expect(res.body.success).toBe(true);
      expect(res.body.data.path).toBe('/doa');
      createdId = res.body.data.id;
    });

    it('the override now drives the resolved metadata (source=override)', async () => {
      const res = await http()
        .get('/api/v1/admin/seo/preview?path=/doa')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.source).toBe('override');
      expect(res.body.data.title).toContain('Doa Pilihan E2E');
    });

    it('admin can list overrides', async () => {
      const res = await http()
        .get('/api/v1/admin/seo/pages')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        res.body.data.some((p: { path: string }) => p.path === '/doa'),
      ).toBe(true);
    });

    it('admin can delete the override', async () => {
      await http()
        .delete(`/api/v1/admin/seo/pages/${createdId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const res = await http()
        .get('/api/v1/admin/seo/preview?path=/doa')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.source).not.toBe('override');
    });
  });

  // ── Admin settings (SEO globals) ──────────────────────────────────────
  describe('Admin settings', () => {
    it('admin can read SEO settings', async () => {
      const res = await http()
        .get('/api/v1/admin/settings?category=seo')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(
        res.body.data.some((s: { key: string }) => s.key === 'seo.site_name'),
      ).toBe(true);
    });

    it('admin can update a setting and it propagates to /seo/globals', async () => {
      await http()
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ values: { 'seo.twitter_handle': '@e2e_handle' } })
        .expect(200);
      const res = await http().get('/api/v1/seo/globals').expect(200);
      expect(res.body.data.twitterHandle).toBe('@e2e_handle');
    });

    it('rejects settings update for a non-admin (403)', async () => {
      await http()
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ values: { 'seo.site_name': 'hack' } })
        .expect(403);
    });
  });

  // ── Error mapping / validation hardening ──────────────────────────────
  describe('Error mapping', () => {
    it('duplicate registration is a clean 4xx, never a 500', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: adminEmail, password, nama: 'dupe' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(res.body.success).toBe(false);
    });

    it('unknown query param is rejected by whitelist (400)', async () => {
      await http().get('/api/v1/doa?bogusParam=1').expect(400);
    });

    it('rejects unauthenticated access to /api/v1/me/notes (401)', async () => {
      await http().get('/api/v1/me/notes').expect(401);
    });
  });
});
