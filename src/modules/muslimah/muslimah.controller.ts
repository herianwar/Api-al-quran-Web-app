import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AmalanQueryDto,
  BayarQadhaDto,
  CreateHaidPeriodDto,
  CreateQadhaDto,
  PuasaSunnahQueryDto,
  StatusQueryDto,
  ToggleAmalanDto,
  UpdateHaidPeriodDto,
  UpdateQadhaDto,
} from './dto/muslimah.dto';
import { MuslimahService } from './muslimah.service';

@ApiTags('Muslimah')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('muslimah')
export class MuslimahController {
  constructor(private readonly service: MuslimahService) {}

  // ─── Dashboard ───────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard Muslimah: status haid/suci, qadha, puasa sunnah, hafalan',
  })
  dashboard(@CurrentUser('userId') userId: string) {
    return this.service.dashboard(userId);
  }

  // ─── Status & riwayat siklus ──────────────────────────────────────────

  @Get('status')
  @ApiOperation({ summary: 'Status ibadah (boleh/tidak sholat & puasa) pada tanggal' })
  status(@CurrentUser('userId') userId: string, @Query() q: StatusQueryDto) {
    return this.service.status(userId, q.date);
  }

  @Get('prediksi')
  @ApiOperation({ summary: 'Prediksi siklus haid berikutnya dari riwayat' })
  prediksi(@CurrentUser('userId') userId: string) {
    return this.service.prediksi(userId);
  }

  @Get('haid')
  @ApiOperation({ summary: 'Riwayat siklus haid/nifas/istihadhah (paginated)' })
  listPeriods(
    @CurrentUser('userId') userId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.service.listPeriods(userId, pagination);
  }

  @Post('haid')
  @ApiOperation({ summary: 'Catat periode haid/nifas/istihadhah (auto-hitung qadha Ramadhan)' })
  createPeriod(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateHaidPeriodDto,
  ) {
    return this.service.createPeriod(userId, dto);
  }

  @Put('haid/:id')
  @ApiOperation({ summary: 'Perbarui periode (mis. set tanggal selesai)' })
  updatePeriod(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateHaidPeriodDto,
  ) {
    return this.service.updatePeriod(userId, id, dto);
  }

  @Delete('haid/:id')
  @ApiOperation({ summary: 'Hapus periode' })
  deletePeriod(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.service.deletePeriod(userId, id);
  }

  // ─── Puasa sunnah ──────────────────────────────────────────────────────

  @Get('puasa-sunnah')
  @ApiOperation({ summary: 'Pengingat puasa sunnah ke depan (Senin–Kamis, Ayyamul Bidh, dll)' })
  puasaSunnah(
    @CurrentUser('userId') userId: string,
    @Query() q: PuasaSunnahQueryDto,
  ) {
    return this.service.puasaSunnah(userId, q.hari);
  }

  // ─── Qadha puasa ───────────────────────────────────────────────────────

  @Get('qadha')
  @ApiOperation({ summary: 'Daftar & ringkasan utang qadha puasa' })
  listQadha(@CurrentUser('userId') userId: string) {
    return this.service.listQadha(userId);
  }

  @Post('qadha')
  @ApiOperation({ summary: 'Tambah hutang qadha puasa' })
  createQadha(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateQadhaDto,
  ) {
    return this.service.createQadha(userId, dto);
  }

  @Put('qadha/:id')
  @ApiOperation({ summary: 'Perbarui entri qadha' })
  updateQadha(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQadhaDto,
  ) {
    return this.service.updateQadha(userId, id, dto);
  }

  @Post('qadha/:id/bayar')
  @ApiOperation({ summary: 'Catat pembayaran qadha (default 1 hari)' })
  bayarQadha(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: BayarQadhaDto,
  ) {
    return this.service.bayarQadha(userId, id, dto);
  }

  @Delete('qadha/:id')
  @ApiOperation({ summary: 'Hapus entri qadha' })
  deleteQadha(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.service.deleteQadha(userId, id);
  }

  // ─── Amalan harian (habit tracker) ─────────────────────────────────────

  @Get('amalan')
  @ApiOperation({ summary: 'Checklist amalan harian + status selesai per hari' })
  amalan(@CurrentUser('userId') userId: string, @Query() q: AmalanQueryDto) {
    return this.service.amalanHari(userId, q.tanggal);
  }

  @Post('amalan/toggle')
  @ApiOperation({ summary: 'Tandai / batalkan satu amalan pada satu hari' })
  toggleAmalan(
    @CurrentUser('userId') userId: string,
    @Body() dto: ToggleAmalanDto,
  ) {
    return this.service.toggleAmalan(userId, dto);
  }

  @Get('amalan/stats')
  @ApiOperation({ summary: 'Streak amalan + riwayat 14 hari' })
  amalanStats(@CurrentUser('userId') userId: string) {
    return this.service.amalanStats(userId);
  }
}
