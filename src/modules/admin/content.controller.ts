import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminContentService } from './content.service';
import { TopicService } from '../topic/topic.service';
import { AdminDoaQueryDto } from './dto/admin-doa-query.dto';
import { DoaDto } from './dto/doa.dto';
import { TopicAyatDto, TopicDto } from './dto/topic.dto';
import { AdminKhutbahQueryDto, KhutbahDto } from './dto/khutbah.dto';
import {
  AdminHadisQudsiQueryDto,
  HadisQudsiDto,
} from './dto/hadis-qudsi.dto';
import { AdminSirahQueryDto, SirahDto } from './dto/sirah.dto';
import { NabiUpdateDto } from './dto/nabi.dto';
import { AsmaulHusnaUpdateDto } from './dto/asmaul-husna.dto';
import {
  BacaanShalatUpdateDto,
  NiatShalatUpdateDto,
  SajdahSetDto,
  TahlilDto,
} from './dto/shalat-tahlil-sajdah.dto';

interface AdminCtx {
  userId: string;
  email: string;
}

@ApiTags('Admin Content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@SkipThrottle()
@Controller('admin/content')
export class AdminContentController {
  constructor(
    private readonly content: AdminContentService,
    private readonly topicSvc: TopicService,
  ) {}

  // ─── DOA ──────────────────────────────────────────────────────────

  @Get('doa')
  @ApiOperation({ summary: 'List doa (paginated, searchable)' })
  listDoa(@Query() query: AdminDoaQueryDto) {
    return this.content.listDoa(query, query.q);
  }

  @Post('doa')
  @ApiOperation({ summary: 'Buat doa baru' })
  createDoa(@Body() body: DoaDto, @CurrentUser() actor: AdminCtx) {
    return this.content.createDoa(body, { id: actor.userId, email: actor.email });
  }

  @Put('doa/:id')
  @ApiOperation({ summary: 'Update doa' })
  updateDoa(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DoaDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateDoa(id, body, { id: actor.userId, email: actor.email });
  }

  @Delete('doa/:id')
  @ApiOperation({ summary: 'Hapus doa' })
  deleteDoa(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.deleteDoa(id, { id: actor.userId, email: actor.email });
  }

  // ─── TOPIC ────────────────────────────────────────────────────────

  @Get('topic')
  @ApiOperation({ summary: 'List semua topik dengan count ayat' })
  listTopics() {
    return this.content.listTopics();
  }

  @Get('topic/:slug')
  @ApiOperation({ summary: 'Detail topik + semua ayat-nya' })
  getTopic(@Param('slug') slug: string) {
    return this.content.getTopic(slug);
  }

  @Post('topic')
  @ApiOperation({ summary: 'Buat topik baru' })
  createTopic(@Body() body: TopicDto, @CurrentUser() actor: AdminCtx) {
    return this.content.createTopic(body, { id: actor.userId, email: actor.email });
  }

  @Put('topic/:id')
  @ApiOperation({ summary: 'Update topik' })
  updateTopic(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TopicDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateTopic(id, body, { id: actor.userId, email: actor.email });
  }

  @Delete('topic/:id')
  @ApiOperation({ summary: 'Hapus topik (semua link ayat ikut terhapus)' })
  deleteTopic(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.deleteTopic(id, { id: actor.userId, email: actor.email });
  }

  @Post('topic/:id/ayat')
  @ApiOperation({ summary: 'Tambahkan ayat ke topik' })
  addAyat(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TopicAyatDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.addAyatToTopic(id, body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Delete('topic-ayat/:linkId')
  @ApiOperation({ summary: 'Hapus 1 link ayat dari topik' })
  removeAyat(
    @Param('linkId', ParseIntPipe) linkId: number,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.removeAyatFromTopic(linkId, {
      id: actor.userId,
      email: actor.email,
    });
  }

  // ─── Topic Explorer AI actions ────────────────────────────────────

  @Post('topic/:slug/ai/summary')
  @ApiOperation({ summary: 'Generate AI summary untuk topik (cached di DB)' })
  topicAiSummary(@Param('slug') slug: string) {
    return this.topicSvc.regenerateSummary(slug);
  }

  @Post('topic/:slug/ai/expand')
  @ApiOperation({
    summary:
      'Auto-discover ayat tambahan via embedding similarity (source=ai)',
  })
  topicAiExpand(@Param('slug') slug: string) {
    return this.topicSvc.expandWithAi(slug);
  }

  @Post('topic/:slug/ai/plan')
  @ApiOperation({
    summary: 'Generate rencana baca 7 hari dari ayat curated topik ini',
  })
  topicAiPlan(@Param('slug') slug: string) {
    return this.topicSvc.generateReadingPlan(slug);
  }

  @Post('topic/ai/expand-all')
  @ApiOperation({
    summary: 'Batch: auto-expand SEMUA topik dengan AI (slow, idempotent)',
  })
  topicAiExpandAll() {
    return this.topicSvc.expandAllWithAi();
  }

  @Post('topic/ai/summary-all')
  @ApiOperation({
    summary: 'Batch: regenerate AI summary untuk SEMUA topik',
  })
  topicAiSummaryAll() {
    return this.topicSvc.regenerateAllSummaries();
  }

  @Get('topic/ai/discover')
  @ApiOperation({
    summary:
      'AI-discover usulan topik baru dari ayat yang belum di-tag (count=5, clusterSize=12)',
  })
  topicAiDiscover(
    @Query('count') count?: string,
    @Query('clusterSize') clusterSize?: string,
  ) {
    return this.topicSvc.discoverNewTopics(
      count ? parseInt(count, 10) : 5,
      clusterSize ? parseInt(clusterSize, 10) : 12,
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // KHUTBAH
  // ═════════════════════════════════════════════════════════════════════

  @Get('khutbah')
  @ApiOperation({ summary: 'List khutbah (paginated, filter tema, search)' })
  listKhutbah(@Query() query: AdminKhutbahQueryDto) {
    return this.content.listKhutbah(query, query.q, query.tema);
  }

  @Get('khutbah/:id')
  @ApiOperation({ summary: 'Detail khutbah' })
  getKhutbah(@Param('id', ParseIntPipe) id: number) {
    return this.content.getKhutbah(id);
  }

  @Post('khutbah')
  @ApiOperation({ summary: 'Buat khutbah baru' })
  createKhutbah(@Body() body: KhutbahDto, @CurrentUser() actor: AdminCtx) {
    return this.content.createKhutbah(body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Put('khutbah/:id')
  @ApiOperation({ summary: 'Update khutbah' })
  updateKhutbah(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: KhutbahDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateKhutbah(id, body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Delete('khutbah/:id')
  @ApiOperation({ summary: 'Hapus khutbah' })
  deleteKhutbah(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.deleteKhutbah(id, {
      id: actor.userId,
      email: actor.email,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // HADIS QUDSI
  // ═════════════════════════════════════════════════════════════════════

  @Get('hadis-qudsi')
  @ApiOperation({ summary: 'List hadis qudsi (paginated, search)' })
  listHadisQudsi(@Query() query: AdminHadisQudsiQueryDto) {
    return this.content.listHadisQudsi(query, query.q);
  }

  @Get('hadis-qudsi/:id')
  @ApiOperation({ summary: 'Detail hadis qudsi' })
  getHadisQudsi(@Param('id', ParseIntPipe) id: number) {
    return this.content.getHadisQudsi(id);
  }

  @Post('hadis-qudsi')
  @ApiOperation({ summary: 'Buat hadis qudsi baru' })
  createHadisQudsi(
    @Body() body: HadisQudsiDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.createHadisQudsi(body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Put('hadis-qudsi/:id')
  @ApiOperation({ summary: 'Update hadis qudsi' })
  updateHadisQudsi(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: HadisQudsiDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateHadisQudsi(id, body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Delete('hadis-qudsi/:id')
  @ApiOperation({ summary: 'Hapus hadis qudsi' })
  deleteHadisQudsi(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.deleteHadisQudsi(id, {
      id: actor.userId,
      email: actor.email,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // SIRAH
  // ═════════════════════════════════════════════════════════════════════

  @Get('sirah')
  @ApiOperation({ summary: 'List sirah' })
  listSirah(@Query() query: AdminSirahQueryDto) {
    return this.content.listSirah(query, query.q);
  }

  @Get('sirah/:id')
  @ApiOperation({ summary: 'Detail sirah' })
  getSirah(@Param('id', ParseIntPipe) id: number) {
    return this.content.getSirah(id);
  }

  @Post('sirah')
  @ApiOperation({ summary: 'Buat bab sirah baru' })
  createSirah(@Body() body: SirahDto, @CurrentUser() actor: AdminCtx) {
    return this.content.createSirah(body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Put('sirah/:id')
  @ApiOperation({ summary: 'Update sirah' })
  updateSirah(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SirahDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateSirah(id, body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Delete('sirah/:id')
  @ApiOperation({ summary: 'Hapus sirah' })
  deleteSirah(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.deleteSirah(id, {
      id: actor.userId,
      email: actor.email,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // NABI (edit-only)
  // ═════════════════════════════════════════════════════════════════════

  @Get('nabi')
  @ApiOperation({ summary: 'List 25 nabi (urutan tetap)' })
  listNabi() {
    return this.content.listNabi();
  }

  @Get('nabi/:id')
  @ApiOperation({ summary: 'Detail nabi' })
  getNabi(@Param('id', ParseIntPipe) id: number) {
    return this.content.getNabi(id);
  }

  @Put('nabi/:id')
  @ApiOperation({
    summary: 'Update editorial fields (nama, kisah, ayat rujukan, dll)',
  })
  updateNabi(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: NabiUpdateDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    // class-validator already validated nested ayatRujukan[]; pass through.
    return this.content.updateNabi(
      id,
      {
        nama: body.nama,
        namaArab: body.namaArab,
        gelar: body.gelar ?? null,
        periode: body.periode ?? null,
        ringkasan: body.ringkasan,
        kisah: body.kisah,
        ayatRujukan: body.ayatRujukan
          ? (body.ayatRujukan as unknown as object[])
          : undefined,
      },
      { id: actor.userId, email: actor.email },
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // ASMAUL HUSNA (detail edit only)
  // ═════════════════════════════════════════════════════════════════════

  @Get('asmaul-husna')
  @ApiOperation({ summary: 'List 99 Asmaul Husna' })
  listAsmaulHusna() {
    return this.content.listAsmaulHusna();
  }

  @Get('asmaul-husna/:id')
  @ApiOperation({ summary: 'Detail 1 nama' })
  getAsmaulHusna(@Param('id', ParseIntPipe) id: number) {
    return this.content.getAsmaulHusna(id);
  }

  @Put('asmaul-husna/:id')
  @ApiOperation({
    summary:
      'Update penjelasan / dalil / faidah (arab/latin/arti tidak editable)',
  })
  updateAsmaulHusna(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AsmaulHusnaUpdateDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateAsmaulHusna(
      id,
      {
        penjelasan: body.penjelasan ?? null,
        dalil: body.dalil ?? null,
        faidah: body.faidah ?? null,
      },
      { id: actor.userId, email: actor.email },
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // NIAT SHALAT (edit-only)
  // ═════════════════════════════════════════════════════════════════════

  @Get('niat-shalat')
  @ApiOperation({ summary: '5 niat shalat fardhu' })
  listNiatShalat() {
    return this.content.listNiatShalat();
  }

  @Get('niat-shalat/:id')
  @ApiOperation({ summary: 'Detail 1 niat shalat' })
  getNiatShalat(@Param('id', ParseIntPipe) id: number) {
    return this.content.getNiatShalat(id);
  }

  @Put('niat-shalat/:id')
  @ApiOperation({ summary: 'Update teks niat shalat (slug & urutan immutable)' })
  updateNiatShalat(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: NiatShalatUpdateDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateNiatShalat(
      id,
      {
        nama: body.nama,
        arab: body.arab,
        latin: body.latin,
        arti: body.arti,
        ...(typeof body.urutan === 'number' ? { urutan: body.urutan } : {}),
      },
      { id: actor.userId, email: actor.email },
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // BACAAN SHALAT (edit-only)
  // ═════════════════════════════════════════════════════════════════════

  @Get('bacaan-shalat')
  @ApiOperation({ summary: 'Semua bacaan shalat (flat list per row)' })
  listBacaanShalat() {
    return this.content.listBacaanShalat();
  }

  @Get('bacaan-shalat/:id')
  @ApiOperation({ summary: 'Detail 1 bacaan shalat' })
  getBacaanShalat(@Param('id', ParseIntPipe) id: number) {
    return this.content.getBacaanShalat(id);
  }

  @Put('bacaan-shalat/:id')
  @ApiOperation({
    summary: 'Update teks bacaan shalat (gerakan & varian immutable)',
  })
  updateBacaanShalat(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: BacaanShalatUpdateDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateBacaanShalat(
      id,
      {
        nama: body.nama,
        arab: body.arab,
        latin: body.latin ?? '',
        arti: body.arti ?? '',
      },
      { id: actor.userId, email: actor.email },
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // TAHLIL (full CRUD)
  // ═════════════════════════════════════════════════════════════════════

  @Get('tahlil')
  @ApiOperation({ summary: 'Daftar urutan tahlil' })
  listTahlil() {
    return this.content.listTahlil();
  }

  @Get('tahlil/:id')
  @ApiOperation({ summary: 'Detail 1 entry tahlil' })
  getTahlil(@Param('id', ParseIntPipe) id: number) {
    return this.content.getTahlil(id);
  }

  @Post('tahlil')
  @ApiOperation({ summary: 'Tambah entry tahlil baru' })
  createTahlil(@Body() body: TahlilDto, @CurrentUser() actor: AdminCtx) {
    return this.content.createTahlil(body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Put('tahlil/:id')
  @ApiOperation({ summary: 'Update entry tahlil' })
  updateTahlil(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TahlilDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.updateTahlil(id, body, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Delete('tahlil/:id')
  @ApiOperation({ summary: 'Hapus entry tahlil' })
  deleteTahlil(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.content.deleteTahlil(id, {
      id: actor.userId,
      email: actor.email,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // AYAT SAJDAH (toggle jenis per ayat)
  // ═════════════════════════════════════════════════════════════════════

  @Get('sajdah')
  @ApiOperation({ summary: 'Daftar 15 ayat sajdah' })
  listSajdah() {
    return this.content.listSajdah();
  }

  @Put('sajdah')
  @ApiOperation({
    summary:
      'Set / hapus tag sajdah pada ayat. Empty `jenis` menghapus tag.',
  })
  setSajdah(@Body() body: SajdahSetDto, @CurrentUser() actor: AdminCtx) {
    return this.content.setSajdah(
      body.surahNomor,
      body.nomorAyat,
      body.jenis || null,
      { id: actor.userId, email: actor.email },
    );
  }
}
