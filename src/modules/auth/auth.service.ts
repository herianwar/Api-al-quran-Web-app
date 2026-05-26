import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from './auth.types';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<ResponsePayload<unknown>> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Email sudah terdaftar',
        error: 'CONFLICT',
      });
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, nama: dto.nama },
    });
    const tokens = await this.issueTokens(user.id, user.email, user.role);
    return ok(
      { user: this.publicUser(user), ...tokens },
      'Registrasi berhasil',
    );
  }

  async login(dto: LoginDto): Promise<ResponsePayload<unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        message: 'Email atau password salah',
        error: 'UNAUTHORIZED',
      });
    }
    const tokens = await this.issueTokens(user.id, user.email, user.role);
    return ok({ user: this.publicUser(user), ...tokens }, 'Login berhasil');
  }

  async refresh(refreshToken: string): Promise<ResponsePayload<unknown>> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException({
        message: 'Refresh token tidak valid atau kedaluwarsa',
        error: 'UNAUTHORIZED',
      });
    }
    // Rotate: delete old, issue new pair.
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    const tokens = await this.issueTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
    );
    return ok(tokens, 'Token berhasil diperbarui');
  }

  async logout(refreshToken: string): Promise<ResponsePayload<unknown>> {
    await this.prisma.refreshToken
      .deleteMany({ where: { token: refreshToken } })
      .catch(() => undefined);
    return ok({ loggedOut: true }, 'Logout berhasil');
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private async issueTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('hex');
    const ttlMs = this.parseDuration(
      this.config.get<string>('jwt.refreshExpiresIn') ?? '7d',
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('jwt.expiresIn'),
    };
  }

  private publicUser(user: {
    id: string;
    email: string;
    nama: string | null;
    role: string;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      nama: user.nama,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  private parseDuration(str: string): number {
    const match = /^(\d+)\s*([smhd])$/.exec(str.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const factor =
      unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return value * factor;
  }
}
