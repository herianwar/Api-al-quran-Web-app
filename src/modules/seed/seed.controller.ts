import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ok } from '../../common/dto/api-response';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { SeedJobName, SeedService } from './seed.service';

const VALID_JOBS: SeedJobName[] = ['surah', 'ayat', 'tafsir', 'doa'];

@ApiTags('Seed (Admin)')
@ApiSecurity('admin-key')
@UseGuards(AdminKeyGuard)
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('start')
  @ApiOperation({ summary: 'Mulai proses seeding semua data' })
  startAll() {
    const result = this.seedService.startAll();
    return ok(result, 'Seeding semua data dimulai');
  }

  @Post('start/:job')
  @ApiOperation({ summary: 'Seeding per kategori (surah/ayat/tafsir/doa)' })
  @ApiParam({ name: 'job', enum: VALID_JOBS })
  startJob(@Param('job') job: string) {
    const jobName = this.assertJob(job);
    const result = this.seedService.startJob(jobName);
    return ok(result, `Seeding "${jobName}" dimulai`);
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
