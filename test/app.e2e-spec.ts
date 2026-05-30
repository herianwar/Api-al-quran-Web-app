import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const ADMIN_KEY = process.env.SEED_ADMIN_KEY ?? 'dev-seed-admin-key';

describe('Quran API (e2e)', () => {
  let app: INestApplication;
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror the global setup from main.ts that affects routing/validation.
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health', () => {
    it('GET /health returns success envelope', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data.services).toHaveProperty('database');
    });
  });

  describe('Quran', () => {
    it('GET /api/v1/quran/surat returns an array in standard envelope', async () => {
      const res = await http().get('/api/v1/quran/surat').expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('cached');
    });

    it('GET /api/v1/quran/halaman/605 is out of range (400)', async () => {
      const res = await http().get('/api/v1/quran/halaman/605').expect(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('BAD_REQUEST');
    });

    it('GET /api/v1/quran/search with too-short q fails validation (400)', async () => {
      await http().get('/api/v1/quran/search?q=a').expect(400);
    });
  });

  describe('Audio', () => {
    it('GET /api/v1/audio/qari lists six qari', async () => {
      const res = await http().get('/api/v1/audio/qari').expect(200);
      expect(res.body.data).toHaveLength(6);
    });
  });

  describe('Seed (admin)', () => {
    it('rejects POST /api/v1/seed/start without admin key (401)', async () => {
      await http().post('/api/v1/seed/start').expect(401);
    });

    it('returns status for the four jobs with admin key', async () => {
      const res = await http()
        .get('/api/v1/seed/status')
        .set('x-seed-admin-key', ADMIN_KEY)
        .expect(200);
      expect(res.body.success).toBe(true);
      const jobs = res.body.data.map((j: { jobName: string }) => j.jobName);
      expect(jobs).toEqual(
        expect.arrayContaining(['surah', 'ayat', 'tafsir', 'doa']),
      );
    });
  });

  describe('Auth + protected routes', () => {
    const email = `e2e_${Date.now()}@example.com`;
    const password = 'password123';
    let accessToken: string;
    let refreshToken: string;

    it('rejects registration with invalid email (400)', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password })
        .expect(400);
    });

    it('registers a new user and returns tokens', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email, password, nama: 'E2E' })
        .expect(201);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('rejects access to /api/v1/user/profile without a token (401)', async () => {
      await http().get('/api/v1/user/profile').expect(401);
    });

    it('allows access to /api/v1/user/profile with a token', async () => {
      const res = await http()
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.email).toBe(email);
    });

    it('logs in with the registered credentials', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('refreshes the access token', async () => {
      const res = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      expect(res.body.data.accessToken).toBeDefined();
    });
  });
});
