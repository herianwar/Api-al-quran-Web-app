import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { ApiUsageInterceptor } from './common/interceptors/api-usage.interceptor';
import { ETagInterceptor } from './common/interceptors/etag.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { EquranModule } from './common/equran/equran.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdzanModule } from './modules/adzan/adzan.module';
import { ArtikelModule } from './modules/artikel/artikel.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ApiKeyModule } from './modules/api-key/api-key.module';
import { AsbabunNuzulModule } from './modules/asbabun-nuzul/asbabun-nuzul.module';
import { AsmaulHusnaModule } from './modules/asmaul-husna/asmaul-husna.module';
import { AuditModule } from './modules/audit/audit.module';
import { AudioModule } from './modules/audio/audio.module';
import { AuthModule } from './modules/auth/auth.module';
import { AyatKataModule } from './modules/ayat-kata/ayat-kata.module';
import { AyatNoteModule } from './modules/ayat-note/ayat-note.module';
import { BacaanShalatModule } from './modules/bacaan-shalat/bacaan-shalat.module';
import { CronModule } from './modules/cron/cron.module';
import { DoaModule } from './modules/doa/doa.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { SerambiModule } from './modules/serambi/serambi.module';
import { HadisQudsiModule } from './modules/hadis-qudsi/hadis-qudsi.module';
import { HadithModule } from './modules/hadith/hadith.module';
import { HealthModule } from './modules/health/health.module';
import { HijriModule } from './modules/hijri/hijri.module';
import { IbadahModule } from './modules/ibadah/ibadah.module';
import { KhutbahModule } from './modules/khutbah/khutbah.module';
import { MuslimahModule } from './modules/muslimah/muslimah.module';
import { NabiModule } from './modules/nabi/nabi.module';
import { NiatShalatModule } from './modules/niat-shalat/niat-shalat.module';
import { NotificationModule } from './modules/notification/notification.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { QuranModule } from './modules/quran/quran.module';
import { SeedModule } from './modules/seed/seed.module';
import { SeoModule } from './modules/seo/seo.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ShopModule } from './modules/shop/shop.module';
import { SholatModule } from './modules/sholat/sholat.module';
import { SirahModule } from './modules/sirah/sirah.module';
import { StreakModule } from './modules/streak/streak.module';
import { TafsirModule } from './modules/tafsir/tafsir.module';
import { TahlilModule } from './modules/tahlil/tahlil.module';
import { TopicModule } from './modules/topic/topic.module';
import { TranslationModule } from './modules/translation/translation.module';
import { UserModule } from './modules/user/user.module';
import { WilayahModule } from './modules/wilayah/wilayah.module';
import { WiridModule } from './modules/wirid/wirid.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
            limit: config.get<number>('throttle.limit') ?? 120,
          },
        ],
      }),
    }),
    // Core infrastructure (global)
    PrismaModule,
    RedisModule,
    EquranModule,
    ApiKeyModule,
    NotificationModule,
    AuditModule,
    SettingsModule,
    AiModule,
    // Feature modules
    HealthModule,
    SeedModule,
    QuranModule,
    AudioModule,
    AdzanModule,
    TafsirModule,
    TranslationModule,
    AsbabunNuzulModule,
    AsmaulHusnaModule,
    TopicModule,
    DoaModule,
    HadithModule,
    HadisQudsiModule,
    SholatModule,
    AuthModule,
    UserModule,
    AdminModule,
    AnalyticsModule,
    CronModule,
    ShopModule,
    SeoModule,
    // New feature modules (Hijri, notes, streak, kata, khutbah, kisah, wirid, quiz)
    HijriModule,
    AyatNoteModule,
    StreakModule,
    AyatKataModule,
    KhutbahModule,
    NabiModule,
    SirahModule,
    WiridModule,
    QuizModule,
    // Shalat content + tahlil
    NiatShalatModule,
    BacaanShalatModule,
    TahlilModule,
    // Portal artikel
    ArtikelModule,
    // Asisten Haid & Ibadah (muslimah)
    MuslimahModule,
    // Daily Ibadah Tracking (checklist sholat 5 waktu per hari)
    IbadahModule,
    // Wilayah Indonesia (dropdown alamat checkout)
    WilayahModule,
    // Masukan & pengajuan fitur dari app + admin panel
    FeedbackModule,
    // Serambi: feed kutipan/renungan admin (feed publik + like/komentar user)
    SerambiModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Requires a valid API key (header x-api-key | cookie api_key | seed key)
    // on every route except those marked @SkipApiKey(). Runs after throttling.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    // Outermost interceptor: records per-app API usage (fire-and-forget) so it
    // measures full latency and sees the final status. Must precede the
    // Transform/ETag interceptors below.
    { provide: APP_INTERCEPTOR, useClass: ApiUsageInterceptor },
    // Order matters: TransformInterceptor wraps payload in envelope, then
    // ETagInterceptor hashes the final wire format.
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ETagInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
