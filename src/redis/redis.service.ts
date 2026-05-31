import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin wrapper around ioredis. All operations degrade gracefully: if Redis is
 * unavailable, reads behave as cache misses and writes are no-ops, so the API
 * keeps serving from the database.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private healthy = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisConfig = this.config.get('redis') as {
      host: string;
      port: number;
      password?: string;
    };

    this.client = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    this.client.on('connect', () => {
      this.healthy = true;
      this.logger.log('Connected to Redis');
    });
    this.client.on('error', (err) => {
      if (this.healthy) {
        this.logger.warn(`Redis error: ${err.message}`);
      }
      this.healthy = false;
    });
    this.client.on('end', () => {
      this.healthy = false;
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  getClient(): Redis {
    return this.client;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.healthy) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`Redis GET ${key} failed: ${(error as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.healthy) return;
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
    } catch (error) {
      this.logger.warn(`Redis SET ${key} failed: ${(error as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.healthy || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch (error) {
      this.logger.warn(`Redis DEL failed: ${(error as Error).message}`);
    }
  }

  /** Delete every key matching a glob pattern (e.g. "surah:*"). */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.healthy) return;
    try {
      const stream = this.client.scanStream({ match: pattern, count: 100 });
      const pipeline = this.client.pipeline();
      let count = 0;
      for await (const keys of stream) {
        for (const key of keys as string[]) {
          pipeline.del(key);
          count++;
        }
      }
      if (count > 0) await pipeline.exec();
    } catch (error) {
      this.logger.warn(
        `Redis DEL pattern ${pattern} failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Cache-aside helper: return cached value or compute, store, and return it.
   */
  async remember<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<{ data: T; cached: boolean }> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return { data: cached, cached: true };
    }
    const data = await factory();
    await this.set(key, data, ttlSeconds);
    return { data, cached: false };
  }

  /**
   * Atomic fixed-window counter: INCR the key, set EXPIRE on the first hit.
   * Returns the new count, or 0 if Redis is down (caller should fail open).
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (!this.healthy) return 0;
    try {
      const n = await this.client.incr(key);
      if (n === 1) await this.client.expire(key, ttlSeconds);
      return n;
    } catch (error) {
      this.logger.warn(`Redis INCR ${key} failed: ${(error as Error).message}`);
      return 0;
    }
  }
}
