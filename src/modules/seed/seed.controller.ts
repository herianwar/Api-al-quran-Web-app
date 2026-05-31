import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ok } from '../../common/dto/api-response';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { SeedJobName, SeedService } from './seed.service';
import { SnapshotService } from './snapshot.service';

const VALID_JOBS: SeedJobName[] = [
  'surah',
  'ayat',
  'tafsir',
  'tafsir_extra',
  'doa',
  'kota',
  'audio',
  'translation',
  'asbabun_nuzul',
  'topic',
  'jadwal_sholat',
  'hadith',
  'asmaul_husna',
  'ayat_kata',
  'embeddings',
  'sajdah',
  'niat_shalat',
  'bacaan_shalat',
  'tahlil',
  'adzan',
];

@ApiTags('Seed (Admin)')
@ApiBearerAuth()
@ApiSecurity('admin-key')
@UseGuards(JwtOrAdminKeyGuard)
// The seed admin page polls /seed/status frequently; it's admin-key guarded,
// so exempt it from the public throttler (was the top source of 429s).
@SkipThrottle()
@Controller('seed')
export class SeedController {
  constructor(
    private readonly seedService: SeedService,
    private readonly snapshotService: SnapshotService,
  ) {}

  @Post('start')
  @ApiOperation({ summary: 'Mulai proses seeding semua data' })
  async startAll() {
    const result = await this.seedService.startAll();
    return ok(result, 'Seeding semua data dimulai');
  }

  @Post('start/:job')
  @ApiOperation({ summary: 'Seeding per kategori (surah/ayat/tafsir/doa)' })
  @ApiParam({ name: 'job', enum: VALID_JOBS })
  async startJob(@Param('job') job: string) {
    const jobName = this.assertJob(job);
    const result = await this.seedService.startJob(jobName);
    return ok(result, `Seeding "${jobName}" dimulai`);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Batalkan semua seed job yang sedang berjalan' })
  async cancelAll() {
    const result = await this.seedService.cancel();
    return ok(result, 'Pembatalan diminta');
  }

  @Post('cancel/:job')
  @ApiOperation({ summary: 'Batalkan satu seed job yang sedang berjalan' })
  @ApiParam({ name: 'job', enum: VALID_JOBS })
  async cancelJob(@Param('job') job: string) {
    const jobName = this.assertJob(job);
    const result = await this.seedService.cancel(jobName);
    return ok(result, `Pembatalan "${jobName}" diminta`);
  }

  @Get('status')
  @ApiOperation({ summary: 'Status semua seed job' })
  async status() {
    const data = await this.seedService.getStatus();
    return ok(data, 'Status seeding');
  }

  @Get('status/:job')
  @ApiOperation({ summary: 'Status satu seed job + progress detail' })
  @ApiParam({ name: 'job', enum: VALID_JOBS })
  async jobStatus(@Param('job') job: string) {
    const jobName = this.assertJob(job);
    const data = await this.seedService.getJobStatus(jobName);
    return ok(data, `Status seeding "${jobName}"`);
  }

  @Delete('reset')
  @ApiOperation({ summary: 'Reset semua data Quran/tafsir/doa (DANGER)' })
  async reset() {
    const data = await this.seedService.reset();
    return ok(data, data.message);
  }

  // ─── Snapshot management ────────────────────────────────────────────

  @Post('snapshot/export')
  @ApiOperation({
    summary:
      'Export pg_dump tabel konten (surahs, ayat, tafsir, doa, kota, jadwal_sholat) ke file .sql.gz',
  })
  async exportSnapshot() {
    const info = await this.snapshotService.exportSnapshot();
    return ok(info, `Snapshot ${info.name} berhasil dibuat`);
  }

  @Get('snapshot')
  @ApiOperation({ summary: 'List semua snapshot di SNAPSHOT_DIR' })
  async listSnapshots() {
    const data = await this.snapshotService.list();
    return ok(data, 'Daftar snapshot', { total: data.length });
  }

  @Post('snapshot/import')
  @ApiOperation({
    summary:
      'Restore snapshot dari file .sql.gz yang ada di SNAPSHOT_DIR. Migration WAJIB sudah jalan duluan di env target.',
  })
  async importSnapshot(@Body() body: { filename?: string }) {
    if (!body?.filename) {
      throw new BadRequestException({
        message: 'Body harus berisi { filename: "quran-content-xxx.sql.gz" }',
        error: 'BAD_REQUEST',
      });
    }
    const data = await this.snapshotService.importSnapshot(body.filename);
    return ok(data, `Snapshot ${data.name} berhasil di-restore`);
  }

  @Get('snapshot/:filename/download')
  @ApiOperation({
    summary:
      'Download file .sql.gz untuk off-site backup. Mengalir sebagai application/gzip (auto-unwrapped, bukan JSON).',
  })
  async downloadSnapshot(
    @Param('filename') filename: string,
  ): Promise<StreamableFile> {
    const info = await this.snapshotService.getSnapshotForDownload(filename);
    return new StreamableFile(createReadStream(info.path), {
      type: 'application/gzip',
      disposition: `attachment; filename="${info.name}"`,
      length: info.size,
    });
  }

  @Delete('snapshot/:filename')
  @ApiOperation({ summary: 'Hapus file snapshot dari SNAPSHOT_DIR' })
  async deleteSnapshot(@Param('filename') filename: string) {
    await this.snapshotService.deleteSnapshot(filename);
    return ok({ deleted: filename }, 'Snapshot dihapus');
  }

  private assertJob(job: string): SeedJobName {
    if (!VALID_JOBS.includes(job as SeedJobName)) {
      throw new BadRequestException({
        message: `Job tidak valid. Pilih salah satu: ${VALID_JOBS.join(', ')}`,
        error: 'BAD_REQUEST',
      });
    }
    return job as SeedJobName;
  }
}
