export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigin: string;
  databaseUrl: string;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  equran: {
    baseUrl: string;
    requestDelayMs: number;
  };
  quranPage: {
    baseUrl: string;
    enabled: boolean;
  };
  /** Prayer-schedule + city-list source (equran.id's /sholat endpoints are dead). */
  sholat: {
    baseUrl: string;
  };
  seedAdminKey: string;
  throttle: {
    ttl: number;
    limit: number;
  };
  /** Directory where the audio cache proxy stores downloaded MP3 files. */
  audioCacheDir: string;
  /** Directory where snapshot exports (pg_dump) are written. */
  snapshotDir: string;
  /** Path to firebase-admin service account JSON. Empty = push disabled. */
  fcmServiceAccountPath?: string;
  /** Public base URL (no trailing slash), e.g. https://rumahquran.id. Used to
   * turn stored /uploads/... paths into absolute media links for API clients
   * (the mobile app can't resolve relative paths). Empty = paths stay relative. */
  apiPublicUrl?: string;
  /** Email of the user who should be auto-promoted to role=admin at boot. */
  adminBootstrapEmail?: string;
  /** Master key for encrypting AppSetting values flagged `isSecret` (AES-256-GCM).
   * Set to a strong random base64 string of >= 32 bytes. Without it, secret
   * settings (mis. AI API keys) cannot be persisted. */
  appEncryptionKey?: string;
}

const MIN_SECRET_LENGTH = 32;
const WEAK_SECRET_PATTERNS = [/^change-me/i, /^changeme/i, /^secret$/i];

function isWeakSecret(value: string): boolean {
  if (!value || value.length < MIN_SECRET_LENGTH) return true;
  return WEAK_SECRET_PATTERNS.some((re) => re.test(value));
}

/**
 * Validates production-critical secrets at config-load time. Booting with
 * placeholder values like `change-me-*` would expose JWT signing and the
 * seed admin endpoint, so we fail fast instead.
 */
function assertProductionSecrets(cfg: AppConfig): void {
  if (cfg.nodeEnv !== 'production') return;
  const violations: string[] = [];
  if (isWeakSecret(cfg.jwt.secret)) violations.push('JWT_SECRET');
  if (isWeakSecret(cfg.jwt.refreshSecret)) violations.push('JWT_REFRESH_SECRET');
  if (isWeakSecret(cfg.seedAdminKey)) violations.push('SEED_ADMIN_KEY');
  if (cfg.jwt.secret === cfg.jwt.refreshSecret) {
    violations.push('JWT_SECRET must differ from JWT_REFRESH_SECRET');
  }
  if (violations.length > 0) {
    throw new Error(
      `Refusing to boot in production with weak/default secrets: ${violations.join(', ')}. ` +
        `Set unique values of at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }
}

export default (): AppConfig => {
  const cfg: AppConfig = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    databaseUrl: process.env.DATABASE_URL ?? '',
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    jwt: {
      secret: process.env.JWT_SECRET ?? 'change-me-secret',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },
    equran: {
      baseUrl: process.env.EQURAN_BASE_URL ?? 'https://equran.id/api/v2',
      requestDelayMs: parseInt(process.env.EQURAN_REQUEST_DELAY_MS ?? '250', 10),
    },
    quranPage: {
      baseUrl:
        process.env.QURAN_PAGE_BASE_URL ?? 'https://api.quran.com/api/v4',
      enabled: (process.env.QURAN_PAGE_ENABLED ?? 'true') !== 'false',
    },
    sholat: {
      baseUrl: process.env.MYQURAN_BASE_URL ?? 'https://api.myquran.com/v2',
    },
    seedAdminKey: process.env.SEED_ADMIN_KEY ?? 'change-me-seed-admin-key',
    throttle: {
      ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
    },
    audioCacheDir: process.env.AUDIO_CACHE_DIR ?? '/app/audio-cache',
    snapshotDir: process.env.SNAPSHOT_DIR ?? '/app/snapshots',
    fcmServiceAccountPath: process.env.FCM_SERVICE_ACCOUNT_PATH || undefined,
    apiPublicUrl: process.env.API_PUBLIC_URL || undefined,
    adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL || undefined,
    appEncryptionKey: process.env.APP_ENCRYPTION_KEY || undefined,
  };
  assertProductionSecrets(cfg);
  return cfg;
};
