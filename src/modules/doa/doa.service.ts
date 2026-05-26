import { Injectable, NotFoundException } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheKey, CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class DoaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getAll(): Promise<ResponsePayload<unknown>> {
    const { data, cached } = await this.redis.remember(
      CacheKey.doaAll(),
      CacheTtl.DOA,
      () => this.prisma.doa.findMany({ orderBy: { id: 'asc' } }),
    );
    return ok(data, 'Daftar doa berhasil diambil', {
      total: data.length,
      cached,
    });
  }

  async getRandom(): Promise<ResponsePayload<unknown>> {
    const count = await this.prisma.doa.count();
    if (count === 0) {
      throw new NotFoundException({
        message: 'Belum ada data doa. Jalankan seeding terlebih dahulu.',
        error: 'NOT_FOUND',
      });
    }
    const skip = Math.floor(Math.random() * count);
    const [doa] = await this.prisma.doa.findMany({ skip, take: 1 });
    return ok(doa, 'Doa random berhasil diambil');
  }

  async getById(id: number): Promise<ResponsePayload<unknown>> {
    const doa = await this.prisma.doa.findUnique({ where: { id } });
    if (!doa) {
      throw new NotFoundException({
        message: `Doa dengan id ${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(doa, 'Doa berhasil diambil');
  }
}
