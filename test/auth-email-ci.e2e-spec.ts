import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { LoginDto, RegisterDto } from '../src/modules/auth/dto/auth.dto';

/**
 * Verifies case-insensitive email normalization in auth:
 *  - RegisterDto/LoginDto transform trims + lowercases the email
 *  - register stores the normalized email
 *  - login with a differently-cased email succeeds (old uppercase accounts
 *    can log in from the new normalized app)
 *  - re-registering the same email in a different case raises a 409
 * Mirrors the service-level style of auth-nohp.e2e-spec.ts (no HTTP/guards).
 */
describe('Auth email case-insensitive (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  const createdEmails: string[] = [];

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

  async function validate_(input: Record<string, unknown>, cls: typeof RegisterDto | typeof LoginDto) {
    const dto = plainToInstance(cls, input);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  }

  it('RegisterDto trims + lowercases the email', async () => {
    const { dto, errors } = await validate_(
      { email: '  Budi@Gmail.Com ', password: 'password123' },
      RegisterDto,
    );
    expect(errors).toHaveLength(0);
    expect((dto as RegisterDto).email).toBe('budi@gmail.com');
  });

  it('LoginDto trims + lowercases the email', async () => {
    const { dto, errors } = await validate_(
      { email: 'BUDI@GMAIL.COM', password: 'password123' },
      LoginDto,
    );
    expect(errors).toHaveLength(0);
    expect((dto as LoginDto).email).toBe('budi@gmail.com');
  });

  it('register stores the normalized (lowercased) email', async () => {
    const base = `ci-store-${process.pid}@test.local`;
    createdEmails.push(base);
    const dto = plainToInstance(RegisterDto, {
      email: `  CI-Store-${process.pid}@Test.Local `,
      password: 'password123',
    });
    const res = await auth.register(dto);
    const user = (res.data as { user: { email: string } }).user;
    expect(user.email).toBe(base);

    const row = await prisma.user.findUnique({ where: { email: base } });
    expect(row).not.toBeNull();
  });

  it('login with a differently-cased email succeeds', async () => {
    const base = `ci-login-${process.pid}@test.local`;
    createdEmails.push(base);
    await auth.register(
      plainToInstance(RegisterDto, { email: base, password: 'password123' }),
    );

    // Client types the email in a different case; DTO normalizes it.
    const loginDto = plainToInstance(LoginDto, {
      email: base.toUpperCase(),
      password: 'password123',
    });
    const res = await auth.login(loginDto);
    const user = (res.data as { user: { email: string } }).user;
    expect(user.email).toBe(base);
  });

  it('re-registering the same email in a different case raises 409', async () => {
    const base = `ci-dup-${process.pid}@test.local`;
    createdEmails.push(base);
    await auth.register(
      plainToInstance(RegisterDto, { email: base, password: 'password123' }),
    );

    await expect(
      auth.register(
        plainToInstance(RegisterDto, {
          email: base.toUpperCase(),
          password: 'password123',
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { message: 'Email sudah terdaftar' },
    });
  });
});
