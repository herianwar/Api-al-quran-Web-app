import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserService } from '../src/modules/user/user.service';

/**
 * Verifies the logout-friendly device-token behavior:
 *  - unregisterDevice is idempotent (200 { deleted } instead of 404)
 *  - unregisterDevice stays scoped to the owner (can't touch another user's token)
 *  - detachDevice sets userId → null (keeps the row for broadcast push)
 * Service-level style like ibadah/auth-nohp specs (no HTTP/guards).
 */
describe('Device token unregister/detach (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UserService;

  const pid = process.pid;
  const ownerEmail = `dev-owner-${pid}@test.local`;
  const otherEmail = `dev-other-${pid}@test.local`;
  let ownerId = '';
  let otherId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(UserService);

    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash: 'x' },
    });
    const other = await prisma.user.create({
      data: { email: otherEmail, passwordHash: 'x' },
    });
    ownerId = owner.id;
    otherId = other.id;
  });

  afterAll(async () => {
    // Cascade delete removes the device tokens owned by these users.
    await prisma.deviceToken
      .deleteMany({ where: { token: { startsWith: `tok-${pid}-` } } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { email: { in: [ownerEmail, otherEmail] } } })
      .catch(() => undefined);
    await app.close();
  });

  const mkToken = (tag: string) => `tok-${pid}-${tag}`;

  async function seedToken(tag: string, userId: string | null) {
    const token = mkToken(tag);
    await prisma.deviceToken.create({
      data: { token, userId, platform: 'android' },
    });
    return token;
  }

  it('unregister on an absent token returns 200 { deleted: false } (idempotent, no 404)', async () => {
    const res = await users.unregisterDevice(ownerId, mkToken('ghost'));
    expect(res.data).toEqual({ deleted: false });
  });

  it('unregister on an owned token deletes it and reports deleted: true', async () => {
    const token = await seedToken('del', ownerId);
    const res = await users.unregisterDevice(ownerId, token);
    expect(res.data).toEqual({ deleted: true });
    const row = await prisma.deviceToken.findUnique({ where: { token } });
    expect(row).toBeNull();

    // Second call is idempotent — no throw, deleted: false.
    const again = await users.unregisterDevice(ownerId, token);
    expect(again.data).toEqual({ deleted: false });
  });

  it("unregister cannot delete another user's token (scoped, deleted: false)", async () => {
    const token = await seedToken('scoped', ownerId);
    const res = await users.unregisterDevice(otherId, token);
    expect(res.data).toEqual({ deleted: false });
    // Row still belongs to the owner, untouched.
    const row = await prisma.deviceToken.findUnique({ where: { token } });
    expect(row?.userId).toBe(ownerId);
  });

  it('detach sets userId → null and keeps the row (detached: true)', async () => {
    const token = await seedToken('detach', ownerId);
    const res = await users.detachDevice(ownerId, token);
    expect(res.data).toEqual({ detached: true });
    const row = await prisma.deviceToken.findUnique({ where: { token } });
    expect(row).not.toBeNull();
    expect(row?.userId).toBeNull();

    // Idempotent — already detached, second call reports detached: false.
    const again = await users.detachDevice(ownerId, token);
    expect(again.data).toEqual({ detached: false });
  });

  it("detach cannot touch another user's token (scoped, detached: false)", async () => {
    const token = await seedToken('detach-scoped', ownerId);
    const res = await users.detachDevice(otherId, token);
    expect(res.data).toEqual({ detached: false });
    const row = await prisma.deviceToken.findUnique({ where: { token } });
    expect(row?.userId).toBe(ownerId);
  });
});
