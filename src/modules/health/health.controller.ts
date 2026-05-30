import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SkipApiKey } from '../../common/decorators/skip-api-key.decorator';

@ApiTags('Health')
@Controller()
// Uptime monitors hit /health without credentials — keep it open.
@SkipApiKey()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check (database + redis)' })
  async health() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    const redis = this.redis.isHealthy();
    return {
      status: db ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      services: { database: db, redis },
    };
  }
}
