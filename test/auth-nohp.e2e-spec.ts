import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { RegisterDto } from '../src/modules/auth/dto/auth.dto';

/**
 * Verifies the `noHp` (nomor HP) field added to registration:
 *  - DTO validation + normalization to E.164 (+62...)
 *  - AuthService.register persists the normalized number
 *  - missing noHp registers fine (backward compatible, stored null)
 *  - duplicate noHp raises a 409 ConflictException
 * Mirrors the service-level style of ibadah.e2e-spec.ts (no HTTP/guards).
 */
describe('Auth noHp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  const createdEmails: string[] = [];

  const uniqueEmail = (tag: string) => `nohp-${tag}-${process.pid}@test.local`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
  });

  afterAll(async () => {
    if (createdEmails.length) {
      await prisma.user
        .deleteMany({ where: { email: { in: createdEmails } } })
        .catch(() => undefined);
    }
    await app.close();
  });

  /** Run RegisterDto through class-validator exactly like the global pipe. */
  async function validateDto(input: Record<string, unknown>) {
    const dto = plainToInstance(RegisterDto, input);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  }

  it('normalizes 08... to E.164 +62...', async () => {
    const { dto, errors } = await validateDto({
      email: uniqueEmail('norm'),
      password: 'password123',
      noHp: '0812-3456 7890',
    });
    expect(errors).toHaveLength(0);
    expect(dto.noHp).toBe('+6281234567890');
  });

  it('accepts +62 and bare 62 prefixes', async () => {
    const a = await validateDto({
      email: 'x@x.com',
      password: 'password123',
      noHp: '+62 812 3456 7890',
    });
    expect(a.errors).toHaveLength(0);
    expect(a.dto.noHp).toBe('+6281234567890');

    const b = await validateDto({
      email: 'x@x.com',
      password: 'password123',
      noHp: '6281234567890',
    });
    expect(b.errors).toHaveLength(0);
    expect(b.dto.noHp).toBe('+6281234567890');
  });

  it('rejects an invalid noHp with a clear message', async () => {
    const { errors } = await validateDto({
      email: 'x@x.com',
      password: 'password123',
      noHp: '123',
    });
    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints ?? {});
    expect(messages).toContain('Nomor HP tidak valid');
  });

  it('treats empty/blank noHp as not provided (optional)', async () => {
    const { dto, errors } = await validateDto({
      email: 'x@x.com',
      password: 'password123',
      noHp: '   ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.noHp).toBeUndefined();
  });

  it('register with valid noHp persists the normalized number', async () => {
    const email = uniqueEmail('save');
    createdEmails.push(email);
    const dto = plainToInstance(RegisterDto, {
      email,
      password: 'password123',
      nama: 'Budi',
      noHp: '081234567800',
    });
    const res = await auth.register(dto);
    const user = (res.data as { user: { noHp: string | null } }).user;
    expect(user.noHp).toBe('+6281234567800');

    const row = await prisma.user.findUnique({ where: { email } });
    expect(row?.noHp).toBe('+6281234567800');
  });

  it('register without noHp succeeds and stores null', async () => {
    const email = uniqueEmail('nul');
    createdEmails.push(email);
    const dto = plainToInstance(RegisterDto, {
      email,
      password: 'password123',
    });
    await auth.register(dto);
    const row = await prisma.user.findUnique({ where: { email } });
    expect(row?.noHp).toBeNull();
  });

  it('duplicate noHp raises a 409 ConflictException', async () => {
    const first = uniqueEmail('dup1');
    const second = uniqueEmail('dup2');
    createdEmails.push(first, second);
    const noHp = '081200000099';

    await auth.register(
      plainToInstance(RegisterDto, {
        email: first,
        password: 'password123',
        noHp,
      }),
    );

    await expect(
      auth.register(
        plainToInstance(RegisterDto, {
          email: second,
          password: 'password123',
          noHp,
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { message: 'Nomor HP sudah terdaftar' },
    });
  });
});
